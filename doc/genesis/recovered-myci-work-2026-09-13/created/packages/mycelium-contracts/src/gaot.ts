/**
 * Stable read contract for the Paperclip-derived GAOT shell.
 *
 * These are canonical Mycelium projections, not writable Paperclip records.
 */
export type GaotCanonicalId = string & { readonly __brand: "GaotCanonicalId" };
export type GaotIsoDateTime = string;

export interface GaotProjectionMetadata {
  canonicalId: GaotCanonicalId;
  canonicalVersion: number;
  sourceHash: string;
  observedAt: GaotIsoDateTime;
}

export type GaotWorkUnitStatus = "DRAFT" | "QUEUED" | "LEASED" | "RUNNING" | "AWAITING_REVIEW" | "REVISION_REQUIRED" | "ACCEPTED" | "BLOCKED" | "ESCALATED" | "CANCELLED";

export interface GaotCompanyView extends GaotProjectionMetadata { name: string; status: "ACTIVE" | "PAUSED" | "SUSPENDED" | "ARCHIVED"; }
export interface GaotWorkerView extends GaotProjectionMetadata { companyId: GaotCanonicalId; displayName: string; roleVersionId: GaotCanonicalId; managerWorkerId?: GaotCanonicalId; controlPlane: "MYCELIUM" | "PAPERCLIP_NATIVE"; status: "AVAILABLE" | "WORKING" | "WAITING" | "NEEDS_HUMAN" | "PAUSED" | "ERROR" | "RETIRED"; }
export interface GaotGoalView extends GaotProjectionMetadata { companyId: GaotCanonicalId; parentGoalId?: GaotCanonicalId; title: string; description: string; status: "PLANNED" | "ACTIVE" | "ACHIEVED" | "FAILED" | "CANCELLED"; }
export interface GaotWorkUnitView extends GaotProjectionMetadata { companyId: GaotCanonicalId; title: string; description: string; status: GaotWorkUnitStatus; assigneeWorkerId?: GaotCanonicalId; goalId?: GaotCanonicalId; outputContractRef?: string; }
export interface GaotRunView extends GaotProjectionMetadata { companyId: GaotCanonicalId; workUnitId?: GaotCanonicalId; workerId: GaotCanonicalId; roleVersionId: GaotCanonicalId; status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED"; workspaceRef?: string; }
export interface GaotActivityView extends GaotProjectionMetadata { companyId: GaotCanonicalId; type: string; summary: string; occurredAt: GaotIsoDateTime; }
/** An immutable, observed execution cost. It is never a budget reservation. */
export interface GaotCostView extends GaotProjectionMetadata { companyId: GaotCanonicalId; workUnitId: GaotCanonicalId; runId: GaotCanonicalId; amountMinor: number; currency: string; sourceKind: "MODEL_USAGE" | "TOOL_EXECUTION" | "INFRASTRUCTURE"; occurredAt: GaotIsoDateTime; }
export interface GaotEvidenceView extends GaotProjectionMetadata { companyId: GaotCanonicalId; workUnitId?: GaotCanonicalId; runId?: GaotCanonicalId; kind: string; uri: string; contentHash: string; }

export interface GaotReadPort {
  getCompany(companyId: GaotCanonicalId): Promise<GaotCompanyView | undefined>;
  listWorkers(companyId: GaotCanonicalId): Promise<GaotWorkerView[]>;
  listGoals(companyId: GaotCanonicalId): Promise<GaotGoalView[]>;
  listWorkUnits(companyId: GaotCanonicalId): Promise<GaotWorkUnitView[]>;
  listRuns(companyId: GaotCanonicalId, workUnitId?: GaotCanonicalId): Promise<GaotRunView[]>;
  listActivity(companyId: GaotCanonicalId): Promise<GaotActivityView[]>;
  listCosts(companyId: GaotCanonicalId): Promise<GaotCostView[]>;
  listEvidence(companyId: GaotCanonicalId, workUnitId?: GaotCanonicalId): Promise<GaotEvidenceView[]>;
}

export interface GaotHealthPort { inspect(): Promise<{ status: "live" | "degraded" | "offline"; observedAt: GaotIsoDateTime; version?: string }>; }
