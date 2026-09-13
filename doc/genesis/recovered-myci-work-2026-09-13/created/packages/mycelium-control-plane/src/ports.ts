import type {
  CanonicalId,
  MyceliumActor,
  WorkUnitStatus,
} from "@genesis/mycelium-contracts";

export type GovernedCommandType =
  | "mycelium.intent.create"
  | "mycelium.plan.confirm"
  | "mycelium.work-unit.dispatch"
  | "mycelium.critic.review"
  | "mycelium.guardian.verdict";

/** The command service deliberately cannot infer authority from a caller id. */
export interface CommandAuthorizer {
  authorize(request: {
    commandType: GovernedCommandType;
    organisationId: CanonicalId;
    actor: MyceliumActor;
    payload: unknown;
  }): Promise<{ outcome: "ALLOW" } | { outcome: "DENY"; reason: string } | { outcome: "REQUIRE_APPROVAL"; reason: string }>;
}

export interface StoredCommandReceipt { id: CanonicalId; version: number; acceptedAt: Date; }

export interface StoredPlan { id: CanonicalId; organisationId: CanonicalId; status: "PREVIEW" | "CONFIRMED" | "SUPERSEDED" | "COMPLETED"; version: number; }
export interface StoredWorkUnit { id: CanonicalId; organisationId: CanonicalId; status: WorkUnitStatus; planId: CanonicalId; version: number; }
export interface StoredRun { id: CanonicalId; organisationId: CanonicalId; workUnitId: CanonicalId; workerId: CanonicalId; status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED"; }

/**
 * The only persistence port granted to canonical command handlers. Each
 * method commits its state change, audit event, and outbox event atomically.
 */
export interface MyceliumCommandStore {
  createIntent(input: { organisationId: CanonicalId; actor: MyceliumActor; text: string }): Promise<StoredCommandReceipt>;
  getPlan(organisationId: CanonicalId, planId: CanonicalId): Promise<StoredPlan | undefined>;
  confirmPlan(input: { organisationId: CanonicalId; planId: CanonicalId; actor: MyceliumActor }): Promise<StoredCommandReceipt>;
  getWorkUnit(organisationId: CanonicalId, workUnitId: CanonicalId): Promise<StoredWorkUnit | undefined>;
  dispatchWorkUnit(input: { organisationId: CanonicalId; workUnitId: CanonicalId; workerId: CanonicalId; actor: MyceliumActor }): Promise<StoredCommandReceipt>;
  getRun(organisationId: CanonicalId, runId: CanonicalId): Promise<StoredRun | undefined>;
  submitCriticReview(input: { organisationId: CanonicalId; workUnitId: CanonicalId; runId: CanonicalId; criticWorkerId: CanonicalId; actor: MyceliumActor; outcome: "PASS" | "REVISE" | "ESCALATE"; rationale: string }): Promise<StoredCommandReceipt>;
  submitGuardianVerdict(input: { organisationId: CanonicalId; workUnitId: CanonicalId; runId?: CanonicalId; actor: MyceliumActor; outcome: "ACCEPT" | "REVISE" | "ESCALATE" | "REJECT"; rationale: string; evidenceIds: CanonicalId[] }): Promise<StoredCommandReceipt>;
}
