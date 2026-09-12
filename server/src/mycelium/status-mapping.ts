/**
 * Presentation-only conversion for a canonical Mycelium WorkUnit. It is kept
 * separate from donor issue transitions so a Run result can never promote a
 * WorkUnit to done.
 */
export type MyceliumWorkUnitStatus =
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

export type GaotPresentationStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "in_review"
  | "done"
  | "blocked"
  | "cancelled";

const statusMap: Record<MyceliumWorkUnitStatus, GaotPresentationStatus> = {
  DRAFT: "backlog",
  QUEUED: "todo",
  LEASED: "in_progress",
  RUNNING: "in_progress",
  AWAITING_REVIEW: "in_review",
  REVISION_REQUIRED: "in_review",
  ACCEPTED: "done",
  BLOCKED: "blocked",
  ESCALATED: "blocked",
  CANCELLED: "cancelled",
};

export function mapWorkUnitStatus(status: MyceliumWorkUnitStatus): GaotPresentationStatus {
  return statusMap[status];
}

/** A terminal execution status is deliberately insufficient for `done`. */
export function mayPresentDone(status: MyceliumWorkUnitStatus): boolean {
  return status === "ACCEPTED";
}
