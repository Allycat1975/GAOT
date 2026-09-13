import type {
  ApprovalRequest,
  AuthorisedToolAction,
  BudgetState,
  Capability,
  DomainEvent,
  Money,
  OrganisationId,
  ToolActionId,
  ToolActionResult,
  ToolConnection,
} from "@genesis/domain";
import type {
  ActionStatePatch,
  ActionStore,
  ApprovalStore,
  BudgetStore,
  CapabilityLookup,
  Clock,
  ConnectionLookup,
  CreateApprovalInput,
  EventPublisher,
  IdGenerator,
  ReconciliationLookup,
  StoredAction,
  ToolAuthorisationEnvelopeVerifier,
  ToolAuthorisationNonceStore,
  GuardianApprovalEvidenceLookup,
} from "./ports.js";
import type { ToolAuthorisationEnvelope } from "@genesis/mycelium-contracts";

/**
 * In-memory reference implementations of the gateway ports.
 *
 * These exist so the gateway's guarantees (idempotency, approval binding,
 * reconciliation) can be proven without live infrastructure. Production
 * implementations live in `@genesis/database`.
 */

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FixedClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return this.current;
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export class SequentialIdGenerator implements IdGenerator {
  private counter = 0;
  next(): string {
    this.counter += 1;
    return `id-${this.counter.toString().padStart(6, "0")}`;
  }
}

export class InMemoryCapabilityLookup implements CapabilityLookup {
  private readonly byKey = new Map<string, Capability>();
  constructor(capabilities: Capability[] = []) {
    for (const capability of capabilities) {
      this.byKey.set(capability.key, capability);
    }
  }
  async get(capabilityKey: string): Promise<Capability | undefined> {
    return this.byKey.get(capabilityKey);
  }
}

export class InMemoryConnectionLookup implements ConnectionLookup {
  private readonly connections: ToolConnection[];
  constructor(connections: ToolConnection[] = []) {
    this.connections = connections;
  }
  async findForCapability(
    organisationId: OrganisationId,
    capabilityKey: string,
  ): Promise<ToolConnection | undefined> {
    return this.connections.find(
      (connection) =>
        connection.organisationId === organisationId &&
        connection.supportedCapabilityKeys.includes(capabilityKey),
    );
  }
}

export class InMemoryActionStore implements ActionStore {
  private readonly byId = new Map<string, StoredAction>();
  private readonly results = new Map<string, ToolActionResult>();

  async findByIdempotencyKey(
    organisationId: OrganisationId,
    idempotencyKey: string,
  ): Promise<StoredAction | undefined> {
    return [...this.byId.values()].find(
      (action) =>
        action.organisationId === organisationId &&
        action.idempotencyKey === idempotencyKey,
    );
  }

  async findById(actionId: ToolActionId): Promise<StoredAction | undefined> {
    return this.byId.get(actionId);
  }

  async create(record: StoredAction): Promise<void> {
    this.byId.set(record.id, record);
  }

  async updateState(
    actionId: ToolActionId,
    state: string,
    patch?: ActionStatePatch,
  ): Promise<void> {
    const existing = this.byId.get(actionId);
    if (existing === undefined) return;
    this.byId.set(actionId, { ...existing, ...patch, state });
  }

  async recordResult(result: ToolActionResult): Promise<void> {
    this.results.set(result.actionId, result);
  }

  async getResult(actionId: ToolActionId): Promise<ToolActionResult | undefined> {
    return this.results.get(actionId);
  }
}

export class InMemoryApprovalStore implements ApprovalStore {
  private readonly byId = new Map<string, ApprovalRequest>();
  private readonly payloadHashes = new Map<string, string>();
  private readonly decisions = new Map<string, "APPROVED" | "REJECTED">();

  async create(input: CreateApprovalInput): Promise<ApprovalRequest> {
    const id = `approval-${this.byId.size + 1}`;
    const approval: ApprovalRequest = {
      id,
      organisationId: input.organisationId,
      actionRequestId: input.actionRequestId,
      requestedBy: input.requestedBy,
      requiredApproverType: "OWNER",
      riskClass: input.riskClass,
      title: input.title,
      summary: input.summary,
      payloadSnapshotId: input.payloadSnapshotId,
      status: "PENDING",
      expiresAt: input.expiresAt,
      createdAt: new Date().toISOString(),
    };
    this.byId.set(id, approval);
    this.payloadHashes.set(id, input.payloadSnapshotId);
    return approval;
  }

  async get(approvalId: string): Promise<ApprovalRequest | undefined> {
    return this.byId.get(approvalId);
  }

  /** Test/application helper: record a human decision. */
  decide(approvalId: string, decision: "APPROVED" | "REJECTED"): void {
    this.decisions.set(approvalId, decision);
  }

  async isCurrent(approvalId: string, payloadHash: string): Promise<boolean> {
    const approval = this.byId.get(approvalId);
    if (approval === undefined) return false;
    if (this.decisions.get(approvalId) !== "APPROVED") return false;
    // The approval is bound to the exact payload that was approved (SEC-005).
    return this.payloadHashes.get(approvalId) === payloadHash;
  }
}

export class InMemoryBudgetStore implements BudgetStore {
  private readonly budgets = new Map<string, BudgetState>();
  constructor(budgets: BudgetState[] = []) {
    for (const budget of budgets) {
      this.budgets.set(budget.budgetId, budget);
    }
  }
  async load(budgetId: string): Promise<BudgetState | undefined> {
    return this.budgets.get(budgetId);
  }
  async reserve(budgetId: string, cost: Money): Promise<void> {
    const budget = this.budgets.get(budgetId);
    if (budget === undefined) return;
    this.budgets.set(budgetId, {
      ...budget,
      reservedMinorUnits: budget.reservedMinorUnits + cost.amountMinorUnits,
    });
  }
  async release(budgetId: string, reserved: Money): Promise<void> {
    const budget = this.budgets.get(budgetId);
    if (budget === undefined) return;
    this.budgets.set(budgetId, {
      ...budget,
      reservedMinorUnits: Math.max(
        0,
        budget.reservedMinorUnits - reserved.amountMinorUnits,
      ),
    });
  }
  async settle(
    budgetId: string,
    reserved: Money,
    actual: Money,
  ): Promise<void> {
    const budget = this.budgets.get(budgetId);
    if (budget === undefined) return;
    this.budgets.set(budgetId, {
      ...budget,
      reservedMinorUnits: Math.max(
        0,
        budget.reservedMinorUnits - reserved.amountMinorUnits,
      ),
      spentMinorUnits: budget.spentMinorUnits + actual.amountMinorUnits,
    });
  }
}

export class InMemoryEventPublisher implements EventPublisher {
  readonly events: DomainEvent[] = [];
  async publish(event: DomainEvent): Promise<void> {
    this.events.push(event);
  }
}

export class InMemoryReconciliationLookup implements ReconciliationLookup {
  private readonly actions = new Map<string, AuthorisedToolAction>();
  register(action: AuthorisedToolAction): void {
    this.actions.set(action.actionId, action);
  }
  async findByActionId(
    actionId: ToolActionId,
  ): Promise<AuthorisedToolAction | undefined> {
    return this.actions.get(actionId);
  }
}

/** Test-only verifier; production must verify Mycelium-issued signatures. */
export class InMemoryToolAuthorisationEnvelopeVerifier
  implements ToolAuthorisationEnvelopeVerifier
{
  constructor(private readonly valid = true) {}
  async verify(_envelope: ToolAuthorisationEnvelope) {
    return this.valid
      ? ({ valid: true } as const)
      : ({ valid: false, code: "ENVELOPE_SIGNATURE_INVALID", message: "Envelope signature is invalid." } as const);
  }
}

/** Models durable atomic nonce consumption for focused gateway tests. */
export class InMemoryToolAuthorisationNonceStore
  implements ToolAuthorisationNonceStore
{
  private readonly consumed = new Set<string>();
  async consume(nonce: string, _expiresAt: string): Promise<boolean> {
    if (this.consumed.has(nonce)) return false;
    this.consumed.add(nonce);
    return true;
  }
}

export class InMemoryGuardianApprovalEvidenceLookup
  implements GuardianApprovalEvidenceLookup
{
  constructor(private readonly approved = true) {}
  async isCurrent(): Promise<boolean> {
    return this.approved;
  }
}
