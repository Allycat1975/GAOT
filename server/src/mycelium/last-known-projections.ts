import { and, eq, inArray } from "drizzle-orm";
import {
  activityLog,
  agents,
  companies,
  costEvents,
  documents,
  genesisProjectionBindings,
  goals,
  heartbeatRuns,
  issues,
  type Db,
} from "@paperclipai/db";
import type { MyceliumCollectionProjection, MyceliumCompanyProjection } from "./client.js";

/**
 * Read-only, binding-scoped fallback for A1.  These rows are presentation
 * targets previously written by the Mycelium projection writer; unbound donor
 * rows are never returned as a fallback source.
 */
export type LastKnownProjectionPort = {
  getCompany(canonicalCompanyId: string): Promise<MyceliumCompanyProjection | undefined>;
  listWorkers(canonicalCompanyId: string): Promise<MyceliumCollectionProjection | undefined>;
  listGoals(canonicalCompanyId: string): Promise<MyceliumCollectionProjection | undefined>;
  listWorkUnits(canonicalCompanyId: string): Promise<MyceliumCollectionProjection | undefined>;
  listRuns(canonicalCompanyId: string): Promise<MyceliumCollectionProjection | undefined>;
  listActivity(canonicalCompanyId: string): Promise<MyceliumCollectionProjection | undefined>;
  listCosts(canonicalCompanyId: string): Promise<MyceliumCollectionProjection | undefined>;
  listEvidence(canonicalCompanyId: string): Promise<MyceliumCollectionProjection | undefined>;
};

type Binding = typeof genesisProjectionBindings.$inferSelect;

export function createLastKnownProjectionPort(db: Db): LastKnownProjectionPort {
  return {
    async getCompany(canonicalCompanyId) {
      const binding = await findCompanyBinding(db, canonicalCompanyId);
      if (!binding) return undefined;
      const [row] = await db.select().from(companies).where(eq(companies.id, binding.companyId)).limit(1);
      if (!row) return undefined;
      return {
        canonicalId: binding.canonicalId,
        canonicalVersion: version(binding),
        sourceHash: binding.sourceHash ?? "",
        observedAt: binding.observedAt.toISOString(),
        name: row.name,
        status: companyStatus(row.status),
      };
    },
    listWorkers: (id) => listAgents(db, id),
    listGoals: (id) => listBoundRows(db, id, ["goal"], ["goal"], goals, (row, binding) => ({
      canonicalId: binding.canonicalId, canonicalVersion: version(binding), sourceHash: binding.sourceHash ?? "", observedAt: binding.observedAt.toISOString(), companyId: id,
      title: row.title, description: row.description, status: row.status,
    })),
    listWorkUnits: (id) => listBoundRows(db, id, ["issue", "work_unit", "work-unit"], ["issue", "work_unit", "work-unit"], issues, (row, binding) => ({
      canonicalId: binding.canonicalId, canonicalVersion: version(binding), sourceHash: binding.sourceHash ?? "", observedAt: binding.observedAt.toISOString(), companyId: id,
      title: row.title, description: row.description, status: row.status,
    })),
    listRuns: (id) => listBoundRows(db, id, ["heartbeat-run"], ["run", "heartbeat_run", "heartbeat-run"], heartbeatRuns, (row, binding) => ({
      canonicalId: binding.canonicalId, canonicalVersion: version(binding), sourceHash: binding.sourceHash ?? "", observedAt: binding.observedAt.toISOString(), companyId: id,
      workerId: row.agentId, status: row.status,
    })),
    listActivity: (id) => listBoundRows(db, id, ["activity"], ["activity", "domain_event", "event"], activityLog, (row, binding) => {
      const details = row.details;
      const summary = typeof details === "object" && details !== null && !Array.isArray(details)
        && typeof (details as Record<string, unknown>).summary === "string"
        ? (details as Record<string, unknown>).summary as string
        : row.action;
      return {
        canonicalId: binding.canonicalId, canonicalVersion: version(binding), sourceHash: binding.sourceHash ?? "", observedAt: binding.observedAt.toISOString(), companyId: id,
        type: row.action, summary, occurredAt: row.createdAt.toISOString(),
      };
    }),
    listCosts: (id) => listBoundRows(db, id, ["cost-event"], ["cost", "cost_event", "cost-event"], costEvents, (row, binding) => ({
      canonicalId: binding.canonicalId, canonicalVersion: version(binding), sourceHash: binding.sourceHash ?? "", observedAt: binding.observedAt.toISOString(), companyId: id,
      amountMinor: row.costCents, sourceKind: row.billingType, occurredAt: row.occurredAt.toISOString(),
    })),
    listEvidence: (id) => listBoundRows(db, id, ["document"], ["document", "evidence"], documents, (row, binding) => ({
      canonicalId: binding.canonicalId, canonicalVersion: version(binding), sourceHash: binding.sourceHash ?? "", observedAt: binding.observedAt.toISOString(), companyId: id,
      kind: row.format, uri: row.title ?? row.id,
    })),
  };
}

async function findCompanyBinding(db: Db, canonicalCompanyId: string): Promise<Binding | undefined> {
  const [binding] = await db.select().from(genesisProjectionBindings).where(and(
    eq(genesisProjectionBindings.canonicalSystem, "mycelium"),
    eq(genesisProjectionBindings.canonicalId, canonicalCompanyId),
    eq(genesisProjectionBindings.projectionKind, "company"),
  )).limit(1);
  return binding;
}

async function listAgents(db: Db, canonicalCompanyId: string): Promise<MyceliumCollectionProjection | undefined> {
  const company = await findCompanyBinding(db, canonicalCompanyId);
  if (!company) return undefined;
  const bindings = await db.select().from(genesisProjectionBindings).where(and(
    eq(genesisProjectionBindings.companyId, company.companyId),
    eq(genesisProjectionBindings.canonicalSystem, "mycelium"),
    eq(genesisProjectionBindings.localTargetKind, "agent"),
    inArray(genesisProjectionBindings.projectionKind, ["agent", "worker"]),
  ));
  if (!bindings.length) return [];
  const rows = await db.select().from(agents).where(and(
    eq(agents.companyId, company.companyId),
    inArray(agents.id, bindings.map((item) => item.localTargetId)),
  ));
  const byId = new Map(rows.map((row) => [row.id, row]));
  return bindings.flatMap((binding) => {
    const row = byId.get(binding.localTargetId);
    return row ? [{
      canonicalId: binding.canonicalId, canonicalVersion: version(binding), sourceHash: binding.sourceHash ?? "", observedAt: binding.observedAt.toISOString(), companyId: canonicalCompanyId,
      displayName: row.name, status: row.status,
    }] : [];
  });
}

async function listBoundRows(
  db: Db,
  canonicalCompanyId: string,
  targetKinds: string[],
  projectionKinds: string[],
  table: any,
  map: (row: any, binding: Binding) => Record<string, unknown>,
): Promise<MyceliumCollectionProjection | undefined> {
  const company = await findCompanyBinding(db, canonicalCompanyId);
  if (!company) return undefined;
  const bindings = await db.select().from(genesisProjectionBindings).where(and(
    eq(genesisProjectionBindings.companyId, company.companyId),
    eq(genesisProjectionBindings.canonicalSystem, "mycelium"),
    inArray(genesisProjectionBindings.localTargetKind, targetKinds),
    inArray(genesisProjectionBindings.projectionKind, projectionKinds),
  ));
  if (!bindings.length) return [];
  const rows = await db.select().from(table).where(and(
    eq(table.companyId, company.companyId),
    inArray(table.id, bindings.map((item) => item.localTargetId)),
  ));
  const byId = new Map((rows as Array<{ id: string }>).map((row) => [row.id, row]));
  return bindings.flatMap((binding) => {
    const row = byId.get(binding.localTargetId);
    return row ? [map(row, binding)] : [];
  });
}

function version(binding: Binding): number {
  const parsed = Number(binding.canonicalVersion ?? "0");
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function companyStatus(value: string): MyceliumCompanyProjection["status"] {
  const normalized = value.toUpperCase();
  if (normalized === "PAUSED" || normalized === "SUSPENDED" || normalized === "ARCHIVED") return normalized;
  return "ACTIVE";
}
