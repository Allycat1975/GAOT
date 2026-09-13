import { createHash } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "@genesis/database";
import type {
  GaotActivityView,
  GaotCanonicalId,
  GaotCompanyView,
  GaotCostView,
  GaotEvidenceView,
  GaotGoalView,
  GaotReadPort,
  GaotRunView,
  GaotWorkerView,
  GaotWorkUnitStatus,
  GaotWorkUnitView,
} from "@genesis/mycelium-contracts";

const observedAt = (): string => new Date().toISOString();
const canonicalId = (value: string): GaotCanonicalId => value as GaotCanonicalId;
const hash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** PostgreSQL-backed, read-only canonical projection source for GAOT. */
export class PostgresGaotReadPort implements GaotReadPort {
  public constructor(private readonly db: Kysely<Database>) {}

  public async getCompany(companyId: GaotCanonicalId): Promise<GaotCompanyView | undefined> {
    const row = await this.db.selectFrom("org.organisations").selectAll().where("id", "=", companyId).executeTakeFirst();
    if (!row) return undefined;
    const result: GaotCompanyView = { canonicalId: canonicalId(row.id), canonicalVersion: row.version, sourceHash: hash(row), observedAt: observedAt(), name: row.name, status: row.status };
    return result;
  }

  public async listWorkers(companyId: GaotCanonicalId): Promise<GaotWorkerView[]> {
    const rows = await this.db.selectFrom("agents.instances").selectAll().where("organisation_id", "=", companyId).orderBy("created_at", "asc").execute();
    return rows.map((row) => {
      const result: GaotWorkerView = { canonicalId: canonicalId(row.id), canonicalVersion: row.version, sourceHash: hash(row), observedAt: observedAt(), companyId, displayName: row.display_name, roleVersionId: canonicalId(row.role_version_id), controlPlane: "MYCELIUM", status: row.status as GaotWorkerView["status"] };
      return row.manager_agent_id ? { ...result, managerWorkerId: canonicalId(row.manager_agent_id) } : result;
    });
  }

  public async listGoals(companyId: GaotCanonicalId): Promise<GaotGoalView[]> {
    const rows = await this.db.selectFrom("work.goals").selectAll().where("organisation_id", "=", companyId).orderBy("created_at", "asc").execute();
    return rows.map((row) => {
      const result: GaotGoalView = { canonicalId: canonicalId(row.id), canonicalVersion: 0, sourceHash: hash(row), observedAt: observedAt(), companyId, title: row.title, description: row.description, status: row.status as GaotGoalView["status"] };
      return row.parent_goal_id ? { ...result, parentGoalId: canonicalId(row.parent_goal_id) } : result;
    });
  }

  public async listWorkUnits(companyId: GaotCanonicalId): Promise<GaotWorkUnitView[]> {
    const rows = await this.db.selectFrom("mycelium.work_units").selectAll().where("organisation_id", "=", companyId).orderBy("created_at", "asc").execute();
    return rows.map((row) => {
      const result: GaotWorkUnitView = { canonicalId: canonicalId(row.id), canonicalVersion: row.version, sourceHash: hash(row), observedAt: observedAt(), companyId, title: row.title, description: row.description, status: row.status as GaotWorkUnitStatus };
      const withAssignee = row.assigned_worker_id ? { ...result, assigneeWorkerId: canonicalId(row.assigned_worker_id) } : result;
      const contract = row.output_contract as { schemaRef?: unknown } | null;
      return typeof contract?.schemaRef === "string" ? { ...withAssignee, outputContractRef: contract.schemaRef } : withAssignee;
    });
  }

  public async listRuns(companyId: GaotCanonicalId, workUnitId?: GaotCanonicalId): Promise<GaotRunView[]> {
    let query = this.db.selectFrom("mycelium.runs").selectAll().where("organisation_id", "=", companyId);
    if (workUnitId) query = query.where("work_unit_id", "=", workUnitId);
    const rows = await query.orderBy("created_at", "asc").execute();
    return rows.map((row) => {
      const result: GaotRunView = { canonicalId: canonicalId(row.id), canonicalVersion: row.version, sourceHash: hash(row), observedAt: observedAt(), companyId, workerId: canonicalId(row.worker_id), roleVersionId: canonicalId(row.role_version_id), status: row.status };
      const withWorkspace = row.workspace_ref ? { ...result, workspaceRef: row.workspace_ref } : result;
      return { ...withWorkspace, workUnitId: canonicalId(row.work_unit_id) };
    });
  }

  public async listActivity(companyId: GaotCanonicalId): Promise<GaotActivityView[]> {
    const rows = await this.db.selectFrom("events.domain_events").selectAll().where("organisation_id", "=", companyId).orderBy("occurred_at", "desc").limit(250).execute();
    return rows.map((row) => ({ canonicalId: canonicalId(row.id), canonicalVersion: row.version, sourceHash: hash(row), observedAt: observedAt(), companyId, type: row.type, summary: `${row.aggregate_type}.${row.type}`, occurredAt: row.occurred_at.toISOString() }));
  }

  public async listCosts(companyId: GaotCanonicalId): Promise<GaotCostView[]> {
    const rows = await this.db.selectFrom("mycelium.cost_ledger_entries").selectAll().where("organisation_id", "=", companyId).orderBy("observed_at", "desc").execute();
    return rows.map((row) => ({ canonicalId: canonicalId(row.id), canonicalVersion: 1, sourceHash: hash(row), observedAt: observedAt(), companyId, workUnitId: canonicalId(row.work_unit_id), runId: canonicalId(row.run_id), amountMinor: row.amount_minor, currency: row.currency, sourceKind: row.source_kind, occurredAt: row.observed_at.toISOString() }));
  }

  public async listEvidence(companyId: GaotCanonicalId, workUnitId?: GaotCanonicalId): Promise<GaotEvidenceView[]> {
    let query = this.db.selectFrom("mycelium.evidence").selectAll().where("organisation_id", "=", companyId);
    if (workUnitId) query = query.where("work_unit_id", "=", workUnitId);
    const rows = await query.orderBy("immutable_at", "desc").execute();
    return rows.map((row) => {
      const result: GaotEvidenceView = { canonicalId: canonicalId(row.id), canonicalVersion: 1, sourceHash: hash(row), observedAt: observedAt(), companyId, workUnitId: canonicalId(row.work_unit_id), kind: row.kind, uri: row.uri, contentHash: row.content_hash };
      return row.run_id ? { ...result, runId: canonicalId(row.run_id) } : result;
    });
  }
}
