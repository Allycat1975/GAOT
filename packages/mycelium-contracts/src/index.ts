/** GAOT's sole programmatic boundary to the Genesis Mycelium control plane. */
export type CanonicalId = string & { readonly __brand: "CanonicalId" };
export type IsoDateTime = string;
export type WorkUnitStatus = "DRAFT" | "QUEUED" | "LEASED" | "RUNNING" | "AWAITING_REVIEW" | "REVISION_REQUIRED" | "ACCEPTED" | "BLOCKED" | "ESCALATED" | "CANCELLED";
export interface ProjectionMetadata { canonicalId: CanonicalId; canonicalVersion: number; sourceHash: string; observedAt: IsoDateTime; }
export interface CompanyView extends ProjectionMetadata { name: string; status: "ACTIVE" | "PAUSED" | "SUSPENDED" | "ARCHIVED"; }
export interface WorkerView extends ProjectionMetadata { displayName: string; roleVersionId: CanonicalId; status: "AVAILABLE" | "WORKING" | "WAITING" | "NEEDS_HUMAN" | "PAUSED" | "ERROR" | "RETIRED"; authorityPosture: "WITHIN_AUTHORITY" | "APPROVAL_REQUIRED" | "DENIED"; }
export interface WorkUnitView extends ProjectionMetadata { companyId: CanonicalId; title: string; description: string; status: WorkUnitStatus; assigneeWorkerId?: CanonicalId; intentId?: CanonicalId; planId?: CanonicalId; }
export interface RunView extends ProjectionMetadata { workUnitId: CanonicalId; workerId: CanonicalId; status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED"; authorityManifestHash: string; }
export interface GoalView extends ProjectionMetadata { companyId: CanonicalId; title: string; description: string; status: "PLANNED" | "ACTIVE" | "ACHIEVED" | "FAILED" | "CANCELLED"; parentGoalId?: CanonicalId; }
export interface CostView extends ProjectionMetadata { companyId: CanonicalId; workerId?: CanonicalId; workUnitId?: CanonicalId; provider: string; model: string; amountMinor: number; currency: string; occurredAt: IsoDateTime; }
export interface ActivityView extends ProjectionMetadata { companyId: CanonicalId; type: "INTENT" | "PLAN" | "WORKUNIT" | "RUN" | "CRITIC" | "GUARDIAN" | "EVIDENCE" | "MEMORY" | "AUTHORITY"; summary: string; actorId?: CanonicalId; occurredAt: IsoDateTime; }
export type MyceliumCompany = CompanyView;
export type MyceliumWorker = WorkerView;
export type MyceliumGoal = GoalView;
export type MyceliumWorkUnit = WorkUnitView;
export type MyceliumRun = RunView;
export type MyceliumEvidence = EvidenceArtifact;
export type MyceliumActivityEvent = ActivityView;
export interface MyceliumPortfolio { companies: MyceliumCompany[]; observedAt: IsoDateTime; }
export interface MyceliumOrganisation extends ProjectionMetadata { companyId: CanonicalId; workers: MyceliumWorker[]; }
export interface MyceliumIntent extends ProjectionMetadata { companyId: CanonicalId; text: string; status: "DRAFT" | "CONFIRMED" | "CANCELLED" | "COMPLETED"; }
export interface MyceliumExecutionPlan extends ProjectionMetadata { companyId: CanonicalId; intentId: CanonicalId; workUnits: MyceliumWorkUnit[]; status: "PREVIEW" | "CONFIRMED" | "SUPERSEDED" | "COMPLETED"; }
export interface MyceliumMemory extends ProjectionMetadata { companyId: CanonicalId; evidenceIds: CanonicalId[]; content: string; }
export interface MyceliumAuthorityView extends ProjectionMetadata { companyId: CanonicalId; workerId?: CanonicalId; posture: "WITHIN_AUTHORITY" | "APPROVAL_REQUIRED" | "DENIED"; }
export type MyceliumCostView = CostView;
export interface EvidenceQuery { companyId: CanonicalId; workUnitId?: CanonicalId; }
export interface AuthorityQuery { companyId: CanonicalId; workerId?: CanonicalId; capabilityKey?: string; }
export interface CostQuery { companyId: CanonicalId; from?: IsoDateTime; to?: IsoDateTime; }
export interface ActivityQuery { companyId: CanonicalId; cursor?: string; }
export interface EvidenceArtifact { id: CanonicalId; workUnitId: CanonicalId; runId?: CanonicalId; kind: "REPORT" | "COMMIT" | "TEST_RESULT" | "DOCUMENT" | "DATASET" | "SCREENSHOT" | "EXTERNAL_RECEIPT"; uri: string; contentHash: string; observedAt: IsoDateTime; }
export interface GuardianVerdict { workUnitId: CanonicalId; outcome: "ACCEPT" | "REVISE" | "ESCALATE" | "REJECT"; rationale: string; evidenceIds: CanonicalId[]; decidedAt: IsoDateTime; }
export interface Page<T> { items: T[]; nextCursor?: string; observedAt: IsoDateTime; }
export interface MyceliumReadPort { getPortfolio(): Promise<MyceliumPortfolio>; getCompany(companyId: CanonicalId): Promise<MyceliumCompany>; getOrganisation(companyId: CanonicalId): Promise<MyceliumOrganisation>; listWorkers(companyId: CanonicalId): Promise<MyceliumWorker[]>; getWorker(workerId: CanonicalId): Promise<MyceliumWorker>; listGoals(companyId: CanonicalId): Promise<MyceliumGoal[]>; listIntents(companyId: CanonicalId): Promise<MyceliumIntent[]>; getIntent(intentId: CanonicalId): Promise<MyceliumIntent>; getExecutionPlan(intentId: CanonicalId): Promise<MyceliumExecutionPlan | null>; listWorkUnits(intentId: CanonicalId): Promise<MyceliumWorkUnit[]>; getWorkUnit(workUnitId: CanonicalId): Promise<MyceliumWorkUnit>; listRuns(workUnitId: CanonicalId): Promise<MyceliumRun[]>; getRun(runId: CanonicalId): Promise<MyceliumRun>; listGuardianDecisions(companyId: CanonicalId): Promise<GuardianVerdict[]>; listEvidence(input: EvidenceQuery): Promise<MyceliumEvidence[]>; listMemory(companyId: CanonicalId): Promise<MyceliumMemory[]>; getAuthority(input: AuthorityQuery): Promise<MyceliumAuthorityView>; getCosts(input: CostQuery): Promise<MyceliumCostView>; listActivity(input: ActivityQuery): Promise<MyceliumActivityEvent[]>; }
export interface PreviewIntentRequest { companyId: CanonicalId; requestedBy: CanonicalId; text: string; }
export interface IntentPreview { companyId: CanonicalId; text: string; warnings: string[]; }
export interface ConfirmIntentRequest { companyId: CanonicalId; preview: IntentPreview; confirmedBy: CanonicalId; }
export interface ExecutionPlanPreview { intentId: CanonicalId; workUnits: MyceliumWorkUnit[]; warnings: string[]; }
export interface ConfirmPlanRequest { companyId: CanonicalId; planId: CanonicalId; confirmedBy: CanonicalId; }
export interface DispatchPreview { workUnitId: CanonicalId; workerId: CanonicalId; allowed: boolean; reasons: string[]; }
export interface DispatchRequest { companyId: CanonicalId; workUnitId: CanonicalId; workerId: CanonicalId; requestedBy: CanonicalId; }
export interface GuardianReviewRequest { companyId: CanonicalId; workUnitId: CanonicalId; evidenceIds: CanonicalId[]; outcome: "ACCEPT" | "REVISE" | "ESCALATE" | "REJECT"; rationale: string; decidedBy: CanonicalId; }
export interface RoutineIntentRequest { companyId: CanonicalId; routineId: CanonicalId; requestedBy: CanonicalId; text: string; }
/** The exclusive write boundary for canonical Genesis state. */
export interface MyceliumCommandPort { previewIntent(request: PreviewIntentRequest): Promise<IntentPreview>; confirmIntent(request: ConfirmIntentRequest): Promise<MyceliumIntent>; previewExecutionPlan(intentId: CanonicalId): Promise<ExecutionPlanPreview>; confirmExecutionPlan(request: ConfirmPlanRequest): Promise<MyceliumExecutionPlan>; previewDispatch(workUnitId: CanonicalId): Promise<DispatchPreview>; dispatchWorkUnit(request: DispatchRequest): Promise<MyceliumRun>; submitGuardianReview(request: GuardianReviewRequest): Promise<GuardianVerdict>; pauseCompany(companyId: CanonicalId): Promise<void>; resumeCompany(companyId: CanonicalId): Promise<void>; pauseWorker(workerId: CanonicalId): Promise<void>; resumeWorker(workerId: CanonicalId): Promise<void>; createIntentFromRoutine(request: RoutineIntentRequest): Promise<MyceliumIntent>; }
export type MyceliumEventType = "company.changed" | "worker.changed" | "goal.changed" | "intent.created" | "intent.changed" | "plan.confirmed" | "workunit.changed" | "run.started" | "run.changed" | "run.completed" | "critic.reviewed" | "guardian.review.requested" | "guardian.review.resolved" | "evidence.created" | "memory.created" | "authority.changed" | "cost.recorded";
export interface MyceliumEvent<T = unknown> { id: CanonicalId; type: MyceliumEventType; companyId: CanonicalId; aggregateId: CanonicalId; aggregateVersion: number; occurredAt: IsoDateTime; payload: T; }
export interface SubscriptionHandle { unsubscribe(): Promise<void>; }
export interface MyceliumEventPort { subscribe(companyId: CanonicalId, handler: (event: MyceliumEvent) => Promise<void>): Promise<SubscriptionHandle>; }
export interface MyceliumHealthPort { inspect(): Promise<{ status: "live" | "degraded" | "offline"; observedAt: IsoDateTime; version?: string }>; }
export interface MyceliumControlPlane { reads: MyceliumReadPort; commands: MyceliumCommandPort; events: MyceliumEventPort; health: MyceliumHealthPort; }
/**
 * Required authorization material for a future Tool Gateway integration.
 * Validation, signature checking, and replay storage are deliberately not
 * wired into Paperclip runtime paths until the dedicated governance gate.
 */
export interface ToolAuthorisationEnvelope { companyId: CanonicalId; workUnitId: CanonicalId; runId: CanonicalId; capabilityKey: string; riskClass: "R0" | "R1" | "R2" | "R3"; payloadHash: string; issuedAt: IsoDateTime; expiresAt: IsoDateTime; nonce: string; signature: string; }
