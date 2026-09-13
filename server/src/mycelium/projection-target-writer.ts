import { and, eq } from "drizzle-orm";
import {
  agents,
  companies,
  costEvents,
  documents,
  goals,
  heartbeatRuns,
  issues,
  type Db,
} from "@paperclipai/db";
import {
  mapWorkUnitStatus,
  type MyceliumWorkUnitStatus,
} from "./status-mapping.js";
import {
  ProjectionWriteError,
  type GaotProjectionTargetWriter,
} from "./projection-writer.js";

type ProjectionRecord = Record<string, unknown>;

/**
 * Concrete one-way target adapter for existing GAOT presentation records.
 * Target IDs are supplied by the immutable binding registry; this writer
 * never creates a donor record and cannot change binding metadata.
 */
export function createGaotProjectionTargetWriter(db: Db): GaotProjectionTargetWriter<ProjectionRecord> {
  return {
    async apply(target) {
      const record = requireRecord(target.record);
      assertProjectionKindMatchesTarget(target.projectionKind, target.localTargetKind);
      switch (target.localTargetKind) {
        case "company":
          return updateCompany(db, target.companyId, target.localTargetId, record);
        case "agent":
          return updateAgent(db, target.companyId, target.localTargetId, record);
        case "goal":
          return updateGoal(db, target.companyId, target.localTargetId, record);
        case "issue":
          return updateIssue(db, target.companyId, target.localTargetId, record);
        case "heartbeat-run":
          return updateRun(db, target.companyId, target.localTargetId, record);
        case "document":
          return updateEvidence(db, target.companyId, target.localTargetId, record);
        case "cost-event":
          return updateCost(db, target.companyId, target.localTargetId, record);
        default:
          throw new ProjectionWriteError(`Unsupported GAOT projection target kind: ${target.localTargetKind}`);
      }
    },
  };
}

function assertProjectionKindMatchesTarget(projectionKind: string, targetKind: string): void {
  const allowed: Record<string, readonly string[]> = {
    company: ["company"],
    agent: ["agent", "worker"],
    goal: ["goal"],
    issue: ["issue", "work_unit", "work-unit"],
    "heartbeat-run": ["run", "heartbeat_run", "heartbeat-run"],
    document: ["document", "evidence"],
    "cost-event": ["cost", "cost_event", "cost-event"],
  };
  if (!allowed[targetKind]?.includes(projectionKind)) {
    throw new ProjectionWriteError(`Projection kind ${projectionKind} cannot target ${targetKind}`);
  }
}

async function updateCompany(db: Db, companyId: string, id: string, record: ProjectionRecord): Promise<void> {
  if (id !== companyId) throw new ProjectionWriteError(`Bound company target ${id} does not match company scope ${companyId}`);
  const row = await db.update(companies).set({
    name: requiredString(record, "name"),
    status: normaliseCompanyStatus(requiredString(record, "status")),
    updatedAt: new Date(),
  }).where(eq(companies.id, id)).returning({ id: companies.id });
  requireBoundRow(row, companyId, id, "company");
}

async function updateAgent(db: Db, companyId: string, id: string, record: ProjectionRecord): Promise<void> {
  const row = await db.update(agents).set({
    name: requiredString(record, "displayName"),
    status: normaliseAgentStatus(requiredString(record, "status")),
    updatedAt: new Date(),
  }).where(and(eq(agents.id, id), eq(agents.companyId, companyId))).returning({ id: agents.id });
  requireBoundRow(row, companyId, id, "agent");
}

async function updateGoal(db: Db, companyId: string, id: string, record: ProjectionRecord): Promise<void> {
  const row = await db.update(goals).set({
    title: requiredString(record, "title"),
    description: optionalString(record, "description"),
    status: normaliseGoalStatus(requiredString(record, "status")),
    updatedAt: new Date(),
  }).where(and(eq(goals.id, id), eq(goals.companyId, companyId))).returning({ id: goals.id });
  requireBoundRow(row, companyId, id, "goal");
}

async function updateIssue(db: Db, companyId: string, id: string, record: ProjectionRecord): Promise<void> {
  const status = requiredString(record, "status") as MyceliumWorkUnitStatus;
  const row = await db.update(issues).set({
    title: requiredString(record, "title"),
    description: optionalString(record, "description"),
    status: mapWorkUnitStatus(status),
    updatedAt: new Date(),
  }).where(and(eq(issues.id, id), eq(issues.companyId, companyId))).returning({ id: issues.id });
  requireBoundRow(row, companyId, id, "issue");
}

async function updateRun(db: Db, companyId: string, id: string, record: ProjectionRecord): Promise<void> {
  const row = await db.update(heartbeatRuns).set({
    status: normaliseRunStatus(requiredString(record, "status")),
    updatedAt: new Date(),
  }).where(and(eq(heartbeatRuns.id, id), eq(heartbeatRuns.companyId, companyId))).returning({ id: heartbeatRuns.id });
  requireBoundRow(row, companyId, id, "heartbeat-run");
}

async function updateEvidence(db: Db, companyId: string, id: string, record: ProjectionRecord): Promise<void> {
  const row = await db.update(documents).set({
    title: `${requiredString(record, "kind")}: ${requiredString(record, "uri")}`,
    updatedAt: new Date(),
  }).where(and(eq(documents.id, id), eq(documents.companyId, companyId))).returning({ id: documents.id });
  requireBoundRow(row, companyId, id, "document");
}

async function updateCost(db: Db, companyId: string, id: string, record: ProjectionRecord): Promise<void> {
  const amountMinor = record.amountMinor;
  if (typeof amountMinor !== "number" || !Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new ProjectionWriteError("Cost projection amountMinor must be a non-negative safe integer");
  const occurredAt = new Date(requiredString(record, "occurredAt"));
  if (Number.isNaN(occurredAt.valueOf())) throw new ProjectionWriteError("Cost projection occurredAt must be an ISO timestamp");
  const row = await db.update(costEvents).set({
    costCents: amountMinor,
    provider: "mycelium",
    billingType: requiredString(record, "sourceKind"),
    occurredAt,
  }).where(and(eq(costEvents.id, id), eq(costEvents.companyId, companyId))).returning({ id: costEvents.id });
  requireBoundRow(row, companyId, id, "cost-event");
}

function requireRecord(value: unknown): ProjectionRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new ProjectionWriteError("Projection record must be an object");
  return value as ProjectionRecord;
}
function requiredString(record: ProjectionRecord, field: string): string {
  const value = record[field];
  if (typeof value !== "string" || !value.trim()) throw new ProjectionWriteError(`Projection record requires ${field}`);
  return value;
}
function optionalString(record: ProjectionRecord, field: string): string | null {
  const value = record[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new ProjectionWriteError(`Projection record ${field} must be a string`);
  return value;
}
function requireBoundRow(rows: { id: string }[], companyId: string, id: string, kind: string): void {
  if (rows.length !== 1) throw new ProjectionWriteError(`Bound ${kind} target ${id} was not found in company ${companyId}`);
}
function normaliseCompanyStatus(status: string): string { return mappedStatus(status, { ACTIVE: "active", PAUSED: "paused", SUSPENDED: "suspended", ARCHIVED: "archived" }, "company"); }
function normaliseAgentStatus(status: string): string { return mappedStatus(status, { AVAILABLE: "idle", WORKING: "working", WAITING: "waiting", NEEDS_HUMAN: "needs_human", PAUSED: "paused", ERROR: "error", RETIRED: "retired" }, "worker"); }
function normaliseGoalStatus(status: string): string { return mappedStatus(status, { PLANNED: "planned", ACTIVE: "active", ACHIEVED: "achieved", FAILED: "failed", CANCELLED: "cancelled" }, "goal"); }
function normaliseRunStatus(status: string): string { return mappedStatus(status, { QUEUED: "queued", RUNNING: "running", SUCCEEDED: "succeeded", FAILED: "failed", CANCELLED: "cancelled" }, "run"); }
function mappedStatus(status: string, values: Record<string, string>, target: string): string {
  const result = values[status];
  if (result === undefined) throw new ProjectionWriteError(`Unknown canonical ${target} status: ${status}`);
  return result;
}
