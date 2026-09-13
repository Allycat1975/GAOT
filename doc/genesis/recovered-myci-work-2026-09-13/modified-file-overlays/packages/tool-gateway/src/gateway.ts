import type {
  ActionPolicyRequest,
  AuthorisedToolAction,
  AuthorityDecision,
  Capability,
  CredentialResolver,
  PolicyEngine,
  PolicyRef,
  ToolActionEvaluation,
  ToolActionId,
  ToolActionRequest,
  ToolActionResult,
  ToolError,
  ToolGateway,
} from "@genesis/domain";
import type { ToolAuthorisationEnvelope } from "@genesis/mycelium-contracts";
import type { AdapterRegistry } from "@genesis/tool-sdk";
import { buildToolExecutionContext } from "@genesis/tool-sdk";
import { contentHash } from "./hash.js";
import type {
  ActionStore,
  ApprovalStore,
  AuthorityContextProvider,
  BudgetStore,
  CapabilityLookup,
  Clock,
  ConnectionLookup,
  EventPublisher,
  IdGenerator,
  ReconciliationLookup,
  StoredAction,
  ToolAuthorisationEnvelopeVerifier,
  ToolAuthorisationNonceStore,
  GuardianApprovalEvidenceLookup,
} from "./ports.js";

/**
 * Tool Gateway (Foundation Spec 03 §10–§20; Build Bible §51–§53).
 *
 * `request()` and `execute()` are deliberately separate. No caller receives an
 * `AuthorisedToolAction` except as the result of policy evaluation, and
 * `execute()` re-verifies the full authorisation snapshot immediately before
 * the provider call so that time-of-check / time-of-use gaps cannot be
 * exploited (Build Bible §88).
 *
 * The gateway never trusts the agent. It re-derives authority, re-validates
 * the payload, and enforces idempotency independently (SEC-002, SEC-004).
 */

export interface ToolGatewayDependencies {
  policyEngine: PolicyEngine;
  capabilities: CapabilityLookup;
  connections: ConnectionLookup;
  authorityContext: AuthorityContextProvider;
  actions: ActionStore;
  approvals: ApprovalStore;
  budgets: BudgetStore;
  adapters: AdapterRegistry;
  events: EventPublisher;
  reconciliation: ReconciliationLookup;
  /** Exists only inside trusted execution infrastructure (SEC-001, §53). */
  credentials: CredentialResolver;
  clock: Clock;
  ids: IdGenerator;
  /** How long an authorisation remains valid before it must be re-evaluated. */
  authorisationTtlSeconds: number;
  /** Default per-call timeout handed to the provider adapter. */
  defaultTimeoutMs: number;
  /** Validates Mycelium-issued envelope signatures without exposing keys. */
  envelopeVerifier: ToolAuthorisationEnvelopeVerifier;
  /** Durable, atomic replay protection for Mycelium envelope nonces. */
  envelopeNonces: ToolAuthorisationNonceStore;
  /** Canonical Guardian evidence lookup for R3 external side effects. */
  guardianApprovals: GuardianApprovalEvidenceLookup;
}

export class DefaultToolGateway implements ToolGateway {
  constructor(private readonly deps: ToolGatewayDependencies) {}

  async request(request: ToolActionRequest): Promise<ToolActionEvaluation> {
    const capability = await this.deps.capabilities.get(request.capabilityKey);
    if (capability === undefined || !capability.enabled) {
      return this.denied(
        request,
        "CAPABILITY_UNKNOWN",
        `Capability "${request.capabilityKey}" is not registered or is disabled.`,
      );
    }

    // Idempotency is checked before any evaluation so a retried request never
    // creates a second approval or a second side effect (SEC-008, IT-004).
    const existing = await this.deps.actions.findByIdempotencyKey(
      request.organisationId,
      request.idempotencyKey,
    );
    if (existing !== undefined) {
      return this.replay(existing, request, capability);
    }

    const adapter = this.deps.adapters.get(request.capabilityKey);
    if (adapter === undefined) {
      return this.denied(
        request,
        "ADAPTER_UNAVAILABLE",
        `No adapter is registered for "${request.capabilityKey}".`,
      );
    }

    // Schema validation precedes authority: malformed input is never evaluated.
    let validatedInput: unknown;
    try {
      validatedInput = adapter.validateInput(request.input);
    } catch (error) {
      return this.denied(
        request,
        "SCHEMA_VALIDATION_FAILED",
        `Input failed schema validation: ${errorMessage(error)}`,
      );
    }

    const payloadHash = contentHash(validatedInput);
    const connection = await this.deps.connections.findForCapability(
      request.organisationId,
      request.capabilityKey,
    );
    if (connection === undefined || connection.status !== "ACTIVE") {
      return this.denied(
        request,
        "CONNECTION_UNAVAILABLE",
        `No active connection serves "${request.capabilityKey}".`,
      );
    }

    const context = await this.deps.authorityContext.load(request);
    const policyRequest: ActionPolicyRequest = {
      organisationId: request.organisationId,
      actor: request.requestedBy,
      capabilityKey: request.capabilityKey,
      input: validatedInput,
      riskClass: capability.riskClass,
      hasSideEffect: capability.riskClass !== "R0",
      context,
      ...(request.estimatedCost !== undefined
        ? { estimatedCost: request.estimatedCost }
        : {}),
    };

    const decision = await this.deps.policyEngine.evaluateAction(policyRequest);

    if (decision.outcome === "DENY") {
      await this.deps.actions.create({
        id: request.id,
        organisationId: request.organisationId,
        capabilityKey: request.capabilityKey,
        idempotencyKey: request.idempotencyKey,
        payloadHash,
        state: "DENIED",
      });
      await this.emit("tool_action.denied", request, {
        reasonCode: decision.reasonCode,
        explanation: decision.explanation,
      });
      return {
        outcome: "DENIED",
        requestId: request.id,
        reasonCode: decision.reasonCode,
        explanation: decision.explanation,
        policyRefs: decision.policyRefs,
      };
    }

    if (decision.outcome === "REQUIRE_APPROVAL") {
      return this.requireApproval(
        request,
        capability,
        payloadHash,
        connection.id,
        decision,
      );
    }

    return this.authorise(
      request,
      validatedInput,
      payloadHash,
      connection.id,
      decision.policyRefs,
    );
  }

  async execute(
    action: AuthorisedToolAction,
    envelope?: ToolAuthorisationEnvelope,
  ): Promise<ToolActionResult> {
    const stored = await this.deps.actions.findById(action.actionId);
    if (stored === undefined) {
      return this.failed(action.actionId, "ACTION_UNKNOWN", "No such action.");
    }

    // Idempotent replay: a completed action returns its recorded result and
    // never calls the provider a second time (IT-004, Build Bible §95).
    const recorded = await this.deps.actions.getResult(action.actionId);
    if (recorded !== undefined) return recorded;

    const envelopeFailure = await this.verifyEnvelope(action, envelope);
    if (envelopeFailure !== undefined) return envelopeFailure;

    // Re-verify the authorisation snapshot at execution time (§88).
    const recheck = await this.reverify(action, stored);
    if (recheck !== undefined) return recheck;

    const adapter = this.deps.adapters.get(action.capabilityKey);
    if (adapter === undefined) {
      return this.failed(
        action.actionId,
        "ADAPTER_UNAVAILABLE",
        `No adapter is registered for "${action.capabilityKey}".`,
      );
    }

    await this.deps.actions.updateState(action.actionId, "EXECUTING");
    const startedAt = this.deps.clock.now().toISOString();

    const context = buildToolExecutionContext({
      organisationId: action.organisationId,
      actionId: action.actionId,
      connectionId: action.connectionId,
      correlationId: action.idempotencyKey,
      credentials: this.deps.credentials,
      timeoutMs: this.deps.defaultTimeoutMs,
    });

    let result: ToolActionResult;
    try {
      const output = await adapter.execute(context, action.validatedInput);
      result = {
        actionId: action.actionId,
        status: "SUCCEEDED",
        output,
        startedAt,
        completedAt: this.deps.clock.now().toISOString(),
      };
    } catch (error) {
      result = this.classifyFailure(action.actionId, startedAt, error);
    }

    await this.deps.actions.recordResult(result);
    await this.deps.actions.updateState(action.actionId, result.status);
    await this.settleBudget(stored, result);
    await this.emit(
      result.status === "SUCCEEDED"
        ? "tool_action.executed"
        : "tool_action.failed",
      { ...action, id: action.actionId } as unknown as ToolActionRequest,
      { status: result.status, error: result.error },
    );

    return result;
  }

  async reconcile(actionId: ToolActionId): Promise<ToolActionResult> {
    const stored = await this.deps.actions.findById(actionId);
    if (stored === undefined) {
      return this.failed(actionId, "ACTION_UNKNOWN", "No such action.");
    }

    const adapter = this.deps.adapters.get(stored.capabilityKey);
    if (adapter?.reconcile === undefined) {
      return this.failed(
        actionId,
        "RECONCILIATION_UNSUPPORTED",
        `"${stored.capabilityKey}" cannot be reconciled.`,
      );
    }

    const action = await this.deps.reconciliation.findByActionId(actionId);
    if (action === undefined) {
      return this.failed(
        actionId,
        "ACTION_UNKNOWN",
        "No authorised action to reconcile.",
      );
    }

    const context = buildToolExecutionContext({
      organisationId: stored.organisationId,
      actionId,
      connectionId: stored.connectionId ?? "",
      correlationId: stored.idempotencyKey,
      credentials: this.deps.credentials,
      timeoutMs: this.deps.defaultTimeoutMs,
    });

    const outcome = await adapter.reconcile(context, action);
    const now = this.deps.clock.now().toISOString();
    const result: ToolActionResult = {
      actionId,
      status: outcome.status,
      startedAt: now,
      completedAt: now,
      ...(outcome.output !== undefined ? { output: outcome.output } : {}),
      ...(outcome.externalReference !== undefined
        ? { externalReference: outcome.externalReference }
        : {}),
    };

    await this.deps.actions.recordResult(result);
    await this.deps.actions.updateState(actionId, result.status);
    return result;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async requireApproval(
    request: ToolActionRequest,
    capability: Capability,
    payloadHash: string,
    connectionId: string,
    decision: Extract<AuthorityDecision, { outcome: "REQUIRE_APPROVAL" }>,
  ): Promise<ToolActionEvaluation> {
    const expiresAt = this.expiry();

    const approval = await this.deps.approvals.create({
      organisationId: request.organisationId,
      actionRequestId: request.id,
      requestedBy: request.requestedBy,
      riskClass: capability.riskClass,
      title: `Approve ${request.capabilityKey}`,
      summary: request.reason,
      payloadSnapshotId: payloadHash,
      expiresAt,
    });

    await this.deps.actions.create({
      id: request.id,
      organisationId: request.organisationId,
      capabilityKey: request.capabilityKey,
      idempotencyKey: request.idempotencyKey,
      payloadHash,
      state: "AWAITING_APPROVAL",
      connectionId,
      approvalId: approval.id,
    });
    await this.emit("approval.requested", request, {
      approvalId: approval.id,
      capabilityKey: request.capabilityKey,
    });

    return {
      outcome: "APPROVAL_REQUIRED",
      requestId: request.id,
      approvalRequestId: approval.id,
      policyRefs: decision.policyRefs,
    };
  }

  private async authorise(
    request: ToolActionRequest,
    validatedInput: unknown,
    payloadHash: string,
    connectionId: string,
    policyRefs: PolicyRef[],
  ): Promise<ToolActionEvaluation> {
    await this.deps.actions.create({
      id: request.id,
      organisationId: request.organisationId,
      capabilityKey: request.capabilityKey,
      idempotencyKey: request.idempotencyKey,
      payloadHash,
      state: "AUTHORISED",
      connectionId,
    });

    return {
      outcome: "AUTHORISED",
      authorisedAction: this.buildAuthorisedAction(
        request,
        validatedInput,
        payloadHash,
        connectionId,
        policyRefs,
      ),
      policyRefs,
    };
  }

  private buildAuthorisedAction(
    request: ToolActionRequest,
    validatedInput: unknown,
    payloadHash: string,
    connectionId: string,
    policyRefs: PolicyRef[],
  ): AuthorisedToolAction {
    const expiresAt = this.expiry();

    const authorisationSnapshot = contentHash({
      organisationId: request.organisationId,
      capabilityKey: request.capabilityKey,
      payloadHash,
      connectionId,
      policyRefs,
      expiresAt,
    });

    return {
      actionId: request.id,
      requestId: request.id,
      organisationId: request.organisationId,
      capabilityKey: request.capabilityKey,
      validatedInput,
      connectionId,
      idempotencyKey: request.idempotencyKey,
      authorisationSnapshot,
      payloadHash,
      expiresAt,
    };
  }

  /** Re-verifies every precondition immediately before the provider call. */
  private async reverify(
    action: AuthorisedToolAction,
    stored: StoredAction,
  ): Promise<ToolActionResult | undefined> {
    if (Date.parse(action.expiresAt) <= this.deps.clock.now().getTime()) {
      await this.deps.actions.updateState(action.actionId, "EXPIRED");
      return this.failed(
        action.actionId,
        "AUTHORISATION_EXPIRED",
        "Authorisation expired.",
      );
    }

    if (contentHash(action.validatedInput) !== stored.payloadHash) {
      return this.failed(
        action.actionId,
        "PAYLOAD_CHANGED",
        "The payload no longer matches the authorised payload hash.",
      );
    }

    if (stored.approvalId !== undefined) {
      const current = await this.deps.approvals.isCurrent(
        stored.approvalId,
        stored.payloadHash,
      );
      if (!current) {
        return this.failed(
          action.actionId,
          "APPROVAL_INVALID",
          "The approval is no longer current for this payload.",
        );
      }
    }

    return undefined;
  }

  /**
   * Fails closed before a provider is called. The canonical envelope binds a
   * side effect to an exact Mycelium work unit/run and may be used only once.
   */
  private async verifyEnvelope(
    action: AuthorisedToolAction,
    envelope: ToolAuthorisationEnvelope | undefined,
  ): Promise<ToolActionResult | undefined> {
    if (envelope === undefined) {
      return this.failed(action.actionId, "AUTHORISATION_ENVELOPE_REQUIRED", "A Mycelium tool authorisation envelope is required.");
    }
    if (Date.parse(envelope.issuedAt) > this.deps.clock.now().getTime() ||
        Date.parse(envelope.expiresAt) <= this.deps.clock.now().getTime()) {
      return this.failed(action.actionId, "AUTHORISATION_ENVELOPE_EXPIRED", "The Mycelium authorisation envelope is not currently valid.");
    }
    if (String(envelope.organisationId) !== String(action.organisationId) ||
        envelope.capabilityKey !== action.capabilityKey ||
        envelope.payloadHash !== action.payloadHash) {
      return this.failed(action.actionId, "AUTHORISATION_ENVELOPE_MISMATCH", "The Mycelium envelope does not bind this organisation, capability and payload.");
    }
    const verdict = await this.deps.envelopeVerifier.verify(envelope);
    if (!verdict.valid) return this.failed(action.actionId, verdict.code, verdict.message);
    if (envelope.riskClass === "R3") {
      const approved = await this.deps.guardianApprovals.isCurrent({
        organisationId: envelope.organisationId,
        workUnitId: envelope.workUnitId,
        runId: envelope.runId,
        capabilityKey: envelope.capabilityKey,
        payloadHash: envelope.payloadHash,
      });
      if (!approved) {
        return this.failed(action.actionId, "GUARDIAN_APPROVAL_REQUIRED", "R3 execution requires current Guardian approval evidence for this exact envelope.");
      }
    }
    if (!(await this.deps.envelopeNonces.consume(envelope.nonce, envelope.expiresAt))) {
      return this.failed(action.actionId, "AUTHORISATION_ENVELOPE_REPLAYED", "This Mycelium authorisation envelope nonce was already consumed.");
    }
    return undefined;
  }

  private async replay(
    existing: StoredAction,
    request: ToolActionRequest,
    capability: Capability,
  ): Promise<ToolActionEvaluation> {
    // A completed action returns its recorded result and is never re-executed.
    const result = await this.deps.actions.getResult(existing.id);
    if (result !== undefined) {
      return {
        outcome: "AUTHORISED",
        authorisedAction: {
          actionId: existing.id,
          requestId: existing.id,
          organisationId: request.organisationId,
          capabilityKey: request.capabilityKey,
          validatedInput: request.input,
          connectionId: existing.connectionId ?? "",
          idempotencyKey: request.idempotencyKey,
          authorisationSnapshot: "REPLAY",
          payloadHash: existing.payloadHash,
          expiresAt: this.deps.clock.now().toISOString(),
        },
        policyRefs: [],
      };
    }

    if (existing.state === "DENIED") {
      return {
        outcome: "DENIED",
        requestId: existing.id,
        reasonCode: "ALREADY_DENIED",
        explanation: "This action was already denied.",
        policyRefs: [],
      };
    }

    // An action awaiting approval becomes executable only once the approval is
    // current for this exact payload (SEC-005, IT-003).
    if (existing.state === "AWAITING_APPROVAL") {
      if (existing.approvalId === undefined) {
        return this.denied(
          request,
          "APPROVAL_MISSING",
          "The action is awaiting approval but no approval is recorded.",
        );
      }

      const current = await this.deps.approvals.isCurrent(
        existing.approvalId,
        existing.payloadHash,
      );
      if (!current) {
        return {
          outcome: "APPROVAL_REQUIRED",
          requestId: existing.id,
          approvalRequestId: existing.approvalId,
          policyRefs: [],
        };
      }

      const payloadHash = contentHash(request.input);
      if (payloadHash !== existing.payloadHash) {
        return this.denied(
          request,
          "PAYLOAD_CHANGED",
          "The payload no longer matches the approved payload hash.",
        );
      }

      await this.deps.actions.updateState(existing.id, "AUTHORISED");
      return this.authorise(
        { ...request, id: existing.id },
        request.input,
        existing.payloadHash,
        existing.connectionId ?? "",
        [],
      );
    }

    // AUTHORISED or EXECUTING: re-issue the authorisation for the same action.
    if (existing.state === "AUTHORISED" || existing.state === "EXECUTING") {
      return this.authorise(
        { ...request, id: existing.id },
        request.input,
        existing.payloadHash,
        existing.connectionId ?? "",
        [],
      );
    }

    void capability;
    return {
      outcome: "DENIED",
      requestId: existing.id,
      reasonCode: "DUPLICATE_REQUEST",
      explanation: `An action with this idempotency key already exists in state ${existing.state}.`,
      policyRefs: [],
    };
  }

  private async settleBudget(
    stored: StoredAction,
    result: ToolActionResult,
  ): Promise<void> {
    const budgetId = stored.budgetId;
    const reserved = stored.reservedCost;
    if (budgetId === undefined || reserved === undefined) return;

    if (result.status === "SUCCEEDED") {
      await this.deps.budgets.settle(budgetId, reserved, reserved);
    } else {
      await this.deps.budgets.release(budgetId, reserved);
    }
  }

  private classifyFailure(
    actionId: ToolActionId,
    startedAt: string,
    error: unknown,
  ): ToolActionResult {
    const completedAt = this.deps.clock.now().toISOString();
    const isTimeout =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");

    // A timeout may mean the provider completed the action. UNKNOWN is
    // first-class and must be reconciled, never blindly retried (§16, §89).
    const toolError: ToolError = isTimeout
      ? {
          code: "UNKNOWN_EXTERNAL_SIDE_EFFECT",
          message:
            "The provider did not respond in time; the outcome is unknown.",
          retryable: false,
        }
      : {
          code: "PROVIDER_ERROR",
          message: errorMessage(error),
          retryable: true,
        };

    return {
      actionId,
      status: isTimeout ? "UNKNOWN" : "FAILED",
      error: toolError,
      startedAt,
      completedAt,
    };
  }

  private failed(
    actionId: ToolActionId,
    code: string,
    message: string,
  ): ToolActionResult {
    const now = this.deps.clock.now().toISOString();
    return {
      actionId,
      status: "FAILED",
      error: { code, message, retryable: false },
      startedAt: now,
      completedAt: now,
    };
  }

  private denied(
    request: ToolActionRequest,
    reasonCode: string,
    explanation: string,
  ): ToolActionEvaluation {
    return {
      outcome: "DENIED",
      requestId: request.id,
      reasonCode,
      explanation,
      policyRefs: [],
    };
  }

  private expiry(): string {
    return new Date(
      this.deps.clock.now().getTime() + this.deps.authorisationTtlSeconds * 1000,
    ).toISOString();
  }

  private async emit(
    type: string,
    request: ToolActionRequest,
    payload: unknown,
  ): Promise<void> {
    await this.deps.events.publish({
      id: this.deps.ids.next(),
      type,
      version: 1,
      organisationId: request.organisationId,
      aggregateType: "tool_action",
      aggregateId: request.id,
      actor: request.requestedBy,
      payload,
      occurredAt: this.deps.clock.now().toISOString(),
    });
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
