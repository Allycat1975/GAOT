import { api } from "./client";

/**
 * Read-only canonical Mycelium projections exposed through the GAOT facade.
 * The browser supplies a GAOT-local company ID; the server resolves its
 * binding and never accepts a caller-selected canonical ID.
 */
export type MyceliumHealthProjection = {
  status: "live" | "degraded" | "offline";
  observedAt: string;
  version?: string;
};

export type MyceliumProjectionMetadata = {
  canonicalId: string;
  canonicalVersion: number;
  sourceHash: string;
  observedAt: string;
};

export type MyceliumCompanyProjection = MyceliumProjectionMetadata & {
  name: string;
  status: "ACTIVE" | "PAUSED" | "SUSPENDED" | "ARCHIVED";
};

export type MyceliumWorkerProjection = MyceliumProjectionMetadata & {
  displayName: string;
  status: string;
  controlPlane: "MYCELIUM" | "PAPERCLIP_NATIVE";
};

export type MyceliumGoalProjection = MyceliumProjectionMetadata & {
  title: string;
  description: string;
  status: string;
};

export type MyceliumWorkUnitProjection = MyceliumProjectionMetadata & {
  title: string;
  description: string;
  status: "DRAFT" | "QUEUED" | "LEASED" | "RUNNING" | "AWAITING_REVIEW" | "REVISION_REQUIRED" | "ACCEPTED" | "BLOCKED" | "ESCALATED" | "CANCELLED";
  assigneeWorkerId?: string;
  goalId?: string;
};

export type MyceliumRunProjection = MyceliumProjectionMetadata & {
  status: string;
  workerId: string;
  workUnitId?: string;
};

export type MyceliumActivityProjection = MyceliumProjectionMetadata & {
  type: string;
  summary: string;
  occurredAt: string;
};

export type MyceliumCostProjection = MyceliumProjectionMetadata & {
  amountMinor: number;
  currency: string;
};

export type MyceliumEvidenceProjection = MyceliumProjectionMetadata & {
  kind: string;
  uri: string;
  contentHash: string;
  workUnitId?: string;
  runId?: string;
};

function companyPath(localCompanyId: string, suffix = ""): string {
  return `/mycelium/companies/${encodeURIComponent(localCompanyId)}${suffix}`;
}

export const myceliumApi = {
  health: () => api.get<MyceliumHealthProjection>("/mycelium/health"),
  company: (localCompanyId: string) => api.get<MyceliumCompanyProjection>(companyPath(localCompanyId)),
  workers: (localCompanyId: string) => api.get<MyceliumWorkerProjection[]>(companyPath(localCompanyId, "/workers")),
  goals: (localCompanyId: string) => api.get<MyceliumGoalProjection[]>(companyPath(localCompanyId, "/goals")),
  workUnits: (localCompanyId: string) => api.get<MyceliumWorkUnitProjection[]>(companyPath(localCompanyId, "/work-units")),
  runs: (localCompanyId: string) => api.get<MyceliumRunProjection[]>(companyPath(localCompanyId, "/runs")),
  activity: (localCompanyId: string) => api.get<MyceliumActivityProjection[]>(companyPath(localCompanyId, "/activity")),
  costs: (localCompanyId: string) => api.get<MyceliumCostProjection[]>(companyPath(localCompanyId, "/costs")),
  evidence: (localCompanyId: string) => api.get<MyceliumEvidenceProjection[]>(companyPath(localCompanyId, "/evidence")),
};
