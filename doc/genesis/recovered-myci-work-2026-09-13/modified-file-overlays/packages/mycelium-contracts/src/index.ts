/**
 * The only integration boundary between GAOT (the Paperclip-derived shell)
 * and Mycelium (Genesis' canonical control plane).
 *
 * Read ports may serve projected state. Command ports are always live,
 * canonical operations. Neither exposes storage repositories or credentials.
 */
export * from "./gaot.js";

export type CanonicalId = string & { readonly __brand: "CanonicalId" };
export type IsoDateTime = string;

/** Every canonical command has an attributable caller; raw identifiers are insufficient. */
export interface MyceliumActor {
  type: "HUMAN" | "AGENT" | "SYSTEM";
  id: CanonicalId;
}

export type WorkUnitStatus =
  | "DRAFT"
  | "QUEUED"
  | "LEASED"
  | "RUNNING"
  | "AWAITING_REVIEW"
  | "REVISION_REQUIRED"
  | "ACCEPTED"
  | "BLOCKED"
  | "ESCALATED"
  | "CANCELLED";

/** A narrow GAOT read representation; it is never a writable donor record. */
export interface MyceliumWorkUnit {
  id: CanonicalId;
  organisationId: CanonicalId;
  title: string;
  description: string;
  status: WorkUnitStatus;
  intentId?: CanonicalId;
  planId?: CanonicalId;
  leasedByAgentId?: CanonicalId;
  leaseExpiresAt?: IsoDateTime;
  roleVersionId?: CanonicalId;
  version: number;
}

export interface MyceliumRun {
  id: CanonicalId;
  organisationId: CanonicalId;
  workUnitId: CanonicalId;
  workerId: CanonicalId;
  roleVersionId: CanonicalId;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  authorityManifestHash: string;
  criticRunId?: CanonicalId;
}

export interface EvidenceArtifact {
  id: CanonicalId;
  organisationId: CanonicalId;
  workUnitId: CanonicalId;
  runId?: CanonicalId;
  kind: "REPORT" | "COMMIT" | "TEST_RESULT" | "DOCUMENT" | "DATASET" | "SCREENSHOT" | "EXTERNAL_RECEIPT";
  uri: string;
  contentHash: string;
  observedAt: IsoDateTime;
}

export interface GuardianVerdict {
  workUnitId: CanonicalId;
  /** An ACCEPT verdict always names the reviewed execution exactly. */
  runId?: CanonicalId;
  outcome: "ACCEPT" | "REVISE" | "ESCALATE" | "REJECT";
  decidedBy: MyceliumActor;
  rationale: string;
  evidenceIds: CanonicalId[];
}

/** An independent assessment of one completed execution, before Guardian review. */
export interface CriticReview {
  workUnitId: CanonicalId;
  runId: CanonicalId;
  /** The registered worker instance performing the independent review. */
  criticWorkerId: CanonicalId;
  reviewedBy: MyceliumActor;
  outcome: "PASS" | "REVISE" | "ESCALATE";
  rationale: string;
}

export interface CompanyView {
  id: CanonicalId;
  name: string;
  status: "ACTIVE" | "PAUSED" | "SUSPENDED" | "ARCHIVED";
  observedAt: IsoDateTime;
  version: number;
}

export interface WorkerView {
  id: CanonicalId;
  organisationId: CanonicalId;
  displayName: string;
  roleVersionId: CanonicalId;
  status: "AVAILABLE" | "WORKING" | "WAITING" | "NEEDS_HUMAN" | "PAUSED" | "ERROR" | "RETIRED";
  observedAt: IsoDateTime;
}

export interface Page<T> {
  items: T[];
  nextCursor?: string;
  observedAt: IsoDateTime;
}

export interface GoalView { id: CanonicalId; organisationId: CanonicalId; title: string; description: string; status: "PLANNED" | "ACTIVE" | "ACHIEVED" | "FAILED" | "CANCELLED"; }

/** Read-only, projection-friendly queries used by GAOT presentation routes. */
export interface MyceliumReadPort {
  getCompany(companyId: CanonicalId): Promise<CompanyView | undefined>;
  listWorkers(companyId: CanonicalId, cursor?: string): Promise<Page<WorkerView>>;
  listGoals(companyId: CanonicalId, cursor?: string): Promise<Page<GoalView>>;
  listWorkUnits(companyId: CanonicalId, cursor?: string): Promise<Page<MyceliumWorkUnit>>;
  getWorkUnit(companyId: CanonicalId, workUnitId: CanonicalId): Promise<MyceliumWorkUnit | undefined>;
  listRuns(companyId: CanonicalId, workUnitId?: CanonicalId, cursor?: string): Promise<Page<MyceliumRun>>;
  listEvidence(companyId: CanonicalId, workUnitId: CanonicalId): Promise<Page<EvidenceArtifact>>;
}

export interface CreateIntentCommand {
  organisationId: CanonicalId;
  requestedBy: MyceliumActor;
  text: string;
}

export interface ConfirmPlanCommand {
  organisationId: CanonicalId;
  planId: CanonicalId;
  confirmedBy: MyceliumActor;
}

export interface DispatchWorkUnitCommand {
  organisationId: CanonicalId;
  workUnitId: CanonicalId;
  workerId: CanonicalId;
  requestedBy: MyceliumActor;
}

export interface SubmitGuardianVerdictCommand {
  organisationId: CanonicalId;
  verdict: GuardianVerdict;
}

export interface SubmitCriticReviewCommand {
  organisationId: CanonicalId;
  review: CriticReview;
}

export type MyceliumCommand =
  | CreateIntentCommand
  | ConfirmPlanCommand
  | DispatchWorkUnitCommand
  | SubmitCriticReviewCommand
  | SubmitGuardianVerdictCommand;

export interface CommandReceipt {
  commandId: CanonicalId;
  acceptedAt: IsoDateTime;
  canonicalVersion: number;
}

/** The exclusive write boundary for canonical Genesis state. */
export interface MyceliumCommandPort {
  createIntent(command: CreateIntentCommand): Promise<CommandReceipt>;
  confirmPlan(command: ConfirmPlanCommand): Promise<CommandReceipt>;
  dispatchWorkUnit(command: DispatchWorkUnitCommand): Promise<CommandReceipt>;
  submitCriticReview(command: SubmitCriticReviewCommand): Promise<CommandReceipt>;
  submitGuardianVerdict(command: SubmitGuardianVerdictCommand): Promise<CommandReceipt>;
}

export interface MyceliumEvent<T = unknown> {
  id: CanonicalId;
  type:
    | "company.changed"
    | "worker.changed"
    | "goal.changed"
    | "workunit.changed"
    | "run.changed"
    | "evidence.recorded"
    | "guardian.verdict";
  organisationId: CanonicalId;
  aggregateId: CanonicalId;
  aggregateVersion: number;
  occurredAt: IsoDateTime;
  payload: T;
}

/** At-least-once event delivery; consumers must project idempotently. */
export interface MyceliumEventPort {
  subscribe(handler: (event: MyceliumEvent) => Promise<void>): Promise<() => Promise<void>>;
}

export interface MyceliumHealth {
  status: "HEALTHY" | "DEGRADED" | "UNAVAILABLE";
  checkedAt: IsoDateTime;
  detail?: string;
}

export interface MyceliumHealthPort {
  health(): Promise<MyceliumHealth>;
}

export interface ToolAuthorisationEnvelope {
  organisationId: CanonicalId;
  workUnitId: CanonicalId;
  runId: CanonicalId;
  capabilityKey: string;
  riskClass: "R0" | "R1" | "R2" | "R3";
  payloadHash: string;
  issuedAt: IsoDateTime;
  expiresAt: IsoDateTime;
  nonce: string;
  signature: string;
}
