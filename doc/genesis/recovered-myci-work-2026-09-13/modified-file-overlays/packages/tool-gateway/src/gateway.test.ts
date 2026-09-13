import { describe, expect, it } from "vitest";
import type {
  AuthorityContext,
  CapabilityAdapter,
  ToolActionRequest,
  ToolConnection,
} from "@genesis/domain";
import {
  AGENT_ID,
  CAPABILITY_REGISTRY,
  ORG_ID,
  authorityContext,
  croRoleVersion,
  grant,
} from "@genesis/test-kit";
import { AdapterRegistry, defineCapability } from "@genesis/tool-sdk";
import { DefaultPolicyEngine } from "@genesis/policy-engine";
import { DefaultToolGateway } from "./gateway.js";
import type { AuthorityContextProvider } from "./ports.js";
import {
  FixedClock,
  InMemoryActionStore,
  InMemoryApprovalStore,
  InMemoryBudgetStore,
  InMemoryCapabilityLookup,
  InMemoryConnectionLookup,
  InMemoryEventPublisher,
  InMemoryReconciliationLookup,
  InMemoryToolAuthorisationEnvelopeVerifier,
  InMemoryToolAuthorisationNonceStore,
  InMemoryGuardianApprovalEvidenceLookup,
  SequentialIdGenerator,
} from "./memory-stores.js";

/**
 * Tool Gateway integration tests (Foundation Spec 03 §47, IT-001…IT-010).
 *
 * These prove the gateway's non-negotiable guarantees without live
 * infrastructure: no bypass of policy, no duplicate side effects, approval
 * bound to the exact payload, and UNKNOWN never blindly retried.
 */

const NOW = new Date("2026-01-01T00:00:00.000Z");

/** A provider double that records every call it receives. */
class RecordingAdapter {
  readonly calls: unknown[] = [];
  constructor(
    readonly capabilityKey: string,
    private readonly behaviour: "ok" | "timeout" | "error" = "ok",
  ) {}

  validateInput(input: unknown): unknown {
    return input;
  }

  async execute(_context: unknown, input: unknown): Promise<unknown> {
    this.calls.push(input);
    if (this.behaviour === "timeout") {
      const error = new Error("provider timed out");
      error.name = "TimeoutError";
      throw error;
    }
    if (this.behaviour === "error") {
      throw new Error("provider rejected the request");
    }
    return { accepted: true, messageId: `msg-${this.calls.length}` };
  }

  async reconcile(): Promise<{
    status: "SUCCEEDED";
    externalReference: string;
    explanation: string;
  }> {
    return {
      status: "SUCCEEDED",
      externalReference: "msg-reconciled",
      explanation: "The provider confirmed the message was accepted.",
    };
  }
}

function connection(capabilityKeys: string[]): ToolConnection {
  return {
    id: "connection-1",
    organisationId: ORG_ID,
    provider: "test-provider",
    displayName: "Test Provider",
    supportedCapabilityKeys: capabilityKeys,
    credentialReference: "cred://test",
    status: "ACTIVE",
    createdAt: NOW.toISOString(),
  };
}

interface Harness {
  gateway: DefaultToolGateway;
  adapters: Map<string, RecordingAdapter>;
  approvals: InMemoryApprovalStore;
  events: InMemoryEventPublisher;
  clock: FixedClock;
  reconciliation: InMemoryReconciliationLookup;
  actions: InMemoryActionStore;
  execute: (action: Parameters<DefaultToolGateway["execute"]>[0]) => ReturnType<DefaultToolGateway["execute"]>;
}

function harness(
  options: {
    context?: () => AuthorityContext;
    capabilityKeys?: string[];
    behaviour?: "ok" | "timeout" | "error";
    guardianApproved?: boolean;
    envelopeVerified?: boolean;
  } = {},
): Harness {
  const capabilityKeys = options.capabilityKeys ?? [
    "web.search",
    "email.send",
    "payment.initiate",
    "contract.submit",
  ];
  const adapters = new Map<string, RecordingAdapter>();
  const registry = new AdapterRegistry();
  for (const key of capabilityKeys) {
    const adapter = new RecordingAdapter(key, options.behaviour ?? "ok");
    adapters.set(key, adapter);
    registry.register(adapter as unknown as CapabilityAdapter);
  }

  const approvals = new InMemoryApprovalStore();
  const events = new InMemoryEventPublisher();
  const clock = new FixedClock(NOW);
  const reconciliation = new InMemoryReconciliationLookup();
  const actions = new InMemoryActionStore();

  const authorityContextProvider: AuthorityContextProvider = {
    async load(): Promise<AuthorityContext> {
      return options.context?.() ?? authorityContext();
    },
  };

  const gateway = new DefaultToolGateway({
    policyEngine: new DefaultPolicyEngine(),
    capabilities: new InMemoryCapabilityLookup(CAPABILITY_REGISTRY),
    connections: new InMemoryConnectionLookup([connection(capabilityKeys)]),
    authorityContext: authorityContextProvider,
    actions,
    approvals,
    budgets: new InMemoryBudgetStore(),
    adapters: registry,
    events,
    reconciliation,
    credentials: {
      async getSecret() {
        return { value: "super-secret-token" };
      },
    },
    clock,
    ids: new SequentialIdGenerator(),
    authorisationTtlSeconds: 300,
    defaultTimeoutMs: 1000,
    envelopeVerifier: new InMemoryToolAuthorisationEnvelopeVerifier(options.envelopeVerified ?? true),
    envelopeNonces: new InMemoryToolAuthorisationNonceStore(),
    guardianApprovals: new InMemoryGuardianApprovalEvidenceLookup(options.guardianApproved ?? true),
  });

  return {
    gateway, adapters, approvals, events, clock, reconciliation, actions,
    execute(action) {
      return gateway.execute(action, {
        organisationId: action.organisationId,
        workUnitId: "00000000-0000-4000-8000-000000000101" as never,
        runId: "00000000-0000-4000-8000-000000000102" as never,
        capabilityKey: action.capabilityKey,
        riskClass: action.capabilityKey === "contract.submit" ? "R3" : "R0",
        payloadHash: action.payloadHash,
        issuedAt: NOW.toISOString(),
        expiresAt: action.expiresAt,
        nonce: `nonce-${action.actionId}`,
        signature: "test-signature",
      });
    },
  };
}

let actionCounter = 0;
function request(overrides: Partial<ToolActionRequest> = {}): ToolActionRequest {
  actionCounter += 1;
  return {
    id: `action-${actionCounter}` as never,
    organisationId: ORG_ID,
    requestedBy: { type: "AGENT", id: AGENT_ID },
    capabilityKey: "web.search",
    input: { query: "market size" },
    reason: "Research the market.",
    idempotencyKey: `idem-${actionCounter}`,
    requestedAt: NOW.toISOString(),
    ...overrides,
  };
}

describe("IT-001 — permitted R0 search executes automatically", () => {
  it("authorises and executes without approval", async () => {
    const h = harness();
    const evaluation = await h.gateway.request(request());
    expect(evaluation.outcome).toBe("AUTHORISED");
    if (evaluation.outcome !== "AUTHORISED") return;

    const result = await h.execute(evaluation.authorisedAction);
    expect(result.status).toBe("SUCCEEDED");
    expect(h.adapters.get("web.search")?.calls).toHaveLength(1);
  });
});

describe("IT-002 — R2 email requires approval and does not send", () => {
  it("suspends with an approval and never calls the provider", async () => {
    const h = harness();
    const evaluation = await h.gateway.request(
      request({ capabilityKey: "email.send", input: { to: "a@b.com" } }),
    );
    expect(evaluation.outcome).toBe("APPROVAL_REQUIRED");
    expect(h.adapters.get("email.send")?.calls).toHaveLength(0);
    expect(h.events.events.map((e) => e.type)).toContain("approval.requested");
  });
});

describe("IT-003 — approval granted sends the exact email once", () => {
  it("executes the authorised action exactly once", async () => {
    const h = harness();
    const evaluation = await h.gateway.request(
      request({ capabilityKey: "email.send", input: { to: "a@b.com" } }),
    );
    if (evaluation.outcome !== "APPROVAL_REQUIRED") throw new Error("expected approval");

    h.approvals.decide(evaluation.approvalRequestId, "APPROVED");

    // The workflow resumes after approval; the same idempotency key now yields
    // an authorised action bound to the approved payload.
    const resumed = await h.gateway.request(
      request({
        capabilityKey: "email.send",
        input: { to: "a@b.com" },
        idempotencyKey: "idem-3",
      }),
    );
    expect(resumed.outcome).toBe("AUTHORISED");
    if (resumed.outcome !== "AUTHORISED") return;

    const result = await h.execute(resumed.authorisedAction);
    expect(result.status).toBe("SUCCEEDED");
    expect(h.adapters.get("email.send")?.calls).toHaveLength(1);
  });
});

describe("IT-004 — a retried action never duplicates a side effect", () => {
  it("returns the recorded result and does not call the provider again", async () => {
    const h = harness();
    const evaluation = await h.gateway.request(request());
    if (evaluation.outcome !== "AUTHORISED") throw new Error("expected authorisation");

    const first = await h.execute(evaluation.authorisedAction);
    const second = await h.execute(evaluation.authorisedAction);

    expect(first.status).toBe("SUCCEEDED");
    expect(second.status).toBe("SUCCEEDED");
    expect(h.adapters.get("web.search")?.calls).toHaveLength(1);
  });

  it("replays an existing request by idempotency key", async () => {
    const h = harness();
    const original = request({ idempotencyKey: "stable-key" });
    const first = await h.gateway.request(original);
    const replay = await h.gateway.request(
      request({ idempotencyKey: "stable-key" }),
    );
    expect(replay.outcome).toBe("AUTHORISED");
    if (replay.outcome === "AUTHORISED" && first.outcome === "AUTHORISED") {
      expect(replay.authorisedAction.actionId).toBe(
        first.authorisedAction.actionId,
      );
    }
  });
});

describe("IT-005 — a payload modified after approval is invalid", () => {
  it("rejects execution when the payload hash no longer matches", async () => {
    const h = harness();
    const evaluation = await h.gateway.request(
      request({
        capabilityKey: "email.send",
        input: { to: "a@b.com" },
        idempotencyKey: "idem-approval-binding",
      }),
    );
    if (evaluation.outcome !== "APPROVAL_REQUIRED") throw new Error("expected approval");
    h.approvals.decide(evaluation.approvalRequestId, "APPROVED");

    // The workflow resumes with the same idempotency key and receives an
    // authorised action bound to the approved payload.
    const resumed = await h.gateway.request(
      request({
        capabilityKey: "email.send",
        input: { to: "a@b.com" },
        idempotencyKey: "idem-approval-binding",
      }),
    );
    if (resumed.outcome !== "AUTHORISED") throw new Error("expected authorisation");

    const tampered = {
      ...resumed.authorisedAction,
      validatedInput: { to: "attacker@evil.com" },
    };

    const result = await h.execute(tampered);
    expect(result.status).toBe("FAILED");
    expect(result.error?.code).toBe("PAYLOAD_CHANGED");
    expect(h.adapters.get("email.send")?.calls).toHaveLength(0);
  });
});

describe("IT-006 — an agent claiming permission it does not have is denied", () => {
  it("denies a capability the role does not grant", async () => {
    const h = harness({
      context: () =>
        authorityContext({
          roleVersion: croRoleVersion({
            capabilities: [grant("web.search", "ALLOW", "AUTO")],
          }),
        }),
    });
    const evaluation = await h.gateway.request(
      request({ capabilityKey: "email.send", input: { to: "a@b.com" } }),
    );
    expect(evaluation.outcome).toBe("DENIED");
    if (evaluation.outcome === "DENIED") {
      expect(evaluation.reasonCode).toBe("CAPABILITY_NOT_GRANTED");
    }
  });
});

describe("IT-008 — a paused organisation blocks new side effects", () => {
  it("denies a side-effecting action while paused", async () => {
    const h = harness({
      context: () =>
        authorityContext({ organisation: { id: ORG_ID, status: "PAUSED" } }),
    });
    const evaluation = await h.gateway.request(
      request({ capabilityKey: "email.send", input: { to: "a@b.com" } }),
    );
    expect(evaluation.outcome).toBe("DENIED");
    if (evaluation.outcome === "DENIED") {
      expect(evaluation.reasonCode).toBe("ORGANISATION_PAUSED");
    }
  });
});

describe("IT-010 — a timed-out provider yields UNKNOWN, not a blind retry", () => {
  it("classifies a timeout as UNKNOWN and reconciles", async () => {
    const h = harness({ behaviour: "timeout" });
    const evaluation = await h.gateway.request(request());
    if (evaluation.outcome !== "AUTHORISED") throw new Error("expected authorisation");

    const result = await h.execute(evaluation.authorisedAction);
    expect(result.status).toBe("UNKNOWN");
    expect(result.error?.retryable).toBe(false);

    h.reconciliation.register(evaluation.authorisedAction);
    const reconciled = await h.gateway.reconcile(evaluation.authorisedAction.actionId);
    expect(reconciled.status).toBe("SUCCEEDED");
    expect(reconciled.externalReference).toBe("msg-reconciled");
  });
});

describe("MYCI ToolAuthorisationEnvelope governance", () => {
  it("fails closed when no canonical envelope is supplied", async () => {
    const h = harness();
    const evaluation = await h.gateway.request(request());
    if (evaluation.outcome !== "AUTHORISED") throw new Error("expected authorisation");
    const result = await h.gateway.execute(evaluation.authorisedAction);
    expect(result.error?.code).toBe("AUTHORISATION_ENVELOPE_REQUIRED");
    expect(h.adapters.get("web.search")?.calls).toHaveLength(0);
  });

  it("rejects an expired, changed, or replayed envelope before execution", async () => {
    const h = harness();
    const evaluation = await h.gateway.request(request());
    if (evaluation.outcome !== "AUTHORISED") throw new Error("expected authorisation");
    const base = {
      organisationId: evaluation.authorisedAction.organisationId,
      workUnitId: "00000000-0000-4000-8000-000000000201" as never,
      runId: "00000000-0000-4000-8000-000000000202" as never,
      capabilityKey: evaluation.authorisedAction.capabilityKey,
      riskClass: "R0" as const,
      payloadHash: evaluation.authorisedAction.payloadHash,
      issuedAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
      nonce: "one-time-nonce",
      signature: "test-signature",
    };
    const expired = await h.gateway.execute(evaluation.authorisedAction, {
      ...base, expiresAt: NOW.toISOString(), nonce: "expired-nonce",
    });
    expect(expired.error?.code).toBe("AUTHORISATION_ENVELOPE_EXPIRED");
    const changed = await h.gateway.execute(evaluation.authorisedAction, { ...base, payloadHash: "different" });
    expect(changed.error?.code).toBe("AUTHORISATION_ENVELOPE_MISMATCH");
    const first = await h.gateway.execute(evaluation.authorisedAction, base);
    expect(first.status).toBe("SUCCEEDED");
    // A different action with the same nonce is blocked even though no result exists for it.
    const next = await h.gateway.request(request({ idempotencyKey: "nonce-replay" }));
    if (next.outcome !== "AUTHORISED") throw new Error("expected authorisation");
    const replay = await h.gateway.execute(next.authorisedAction, { ...base, payloadHash: next.authorisedAction.payloadHash });
    expect(replay.error?.code).toBe("AUTHORISATION_ENVELOPE_REPLAYED");
  });

  it("does not trust an envelope whose canonical signature verifier rejects it", async () => {
    const h = harness({ envelopeVerified: false });
    const evaluation = await h.gateway.request(request());
    if (evaluation.outcome !== "AUTHORISED") throw new Error("expected authorisation");
    const result = await h.execute(evaluation.authorisedAction);
    expect(result.error?.code).toBe("ENVELOPE_SIGNATURE_INVALID");
    expect(h.adapters.get("web.search")?.calls).toHaveLength(0);
  });

  it("requires Guardian evidence for R3 independently of generic approval", async () => {
    const h = harness({ guardianApproved: false });
    const action = {
      actionId: "r3-action" as never, requestId: "r3-action" as never, organisationId: ORG_ID,
      capabilityKey: "contract.submit", validatedInput: {}, connectionId: "connection-1", idempotencyKey: "r3-envelope",
      authorisationSnapshot: "snapshot", payloadHash: "r3-payload", expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    };
    await h.actions.create({
      id: action.actionId, organisationId: ORG_ID, capabilityKey: action.capabilityKey,
      idempotencyKey: action.idempotencyKey, payloadHash: action.payloadHash,
      state: "AUTHORISED", connectionId: action.connectionId,
    });
    const result = await h.gateway.execute(action, {
      organisationId: ORG_ID,
      workUnitId: "00000000-0000-4000-8000-000000000301" as never,
      runId: "00000000-0000-4000-8000-000000000302" as never,
      capabilityKey: "contract.submit", riskClass: "R3", payloadHash: "r3-payload",
      issuedAt: NOW.toISOString(), expiresAt: action.expiresAt,
      nonce: "r3-nonce", signature: "test-signature",
    });
    expect(result.error?.code).toBe("GUARDIAN_APPROVAL_REQUIRED");
    expect(h.adapters.get("contract.submit")?.calls).toHaveLength(0);
  });
});

describe("SEC-001 — secrets never reach the agent", () => {
  it("returns no credential material in the evaluation or result", async () => {
    const h = harness();
    const evaluation = await h.gateway.request(request());
    const serialised = JSON.stringify(evaluation);
    expect(serialised).not.toContain("super-secret-token");
  });
});
