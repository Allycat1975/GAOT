import { randomUUID } from "node:crypto";
import type { Kysely, Transaction } from "kysely";
import { sql } from "kysely";
import type { Database } from "@genesis/database";
import type { ActorRef, DomainEvent } from "@genesis/domain";
import { writeOutboxEvent } from "@genesis/events";
import type { CanonicalId, MyceliumActor } from "@genesis/mycelium-contracts";
import type { MyceliumCommandStore, StoredCommandReceipt, StoredPlan, StoredRun, StoredWorkUnit } from "./ports.js";

const canonical = (value: string): CanonicalId => value as CanonicalId;
const actorRef = (actor: MyceliumActor): ActorRef => actor as ActorRef;

/** Critic PASS deliberately does not imply acceptance: only Guardian can do that. */
export const workUnitStatusForCriticOutcome = (outcome: "PASS" | "REVISE" | "ESCALATE"): "AWAITING_REVIEW" | "REVISION_REQUIRED" | "ESCALATED" =>
  outcome === "PASS" ? "AWAITING_REVIEW" : outcome === "REVISE" ? "REVISION_REQUIRED" : "ESCALATED";

/**
 * PostgreSQL implementation. It never exposes a table repository: each
 * method owns a transaction containing canonical mutation, audit event, and
 * transactional outbox event.
 */
export class PostgresMyceliumCommandStore implements MyceliumCommandStore {
  constructor(private readonly db: Kysely<Database>) {}

  async createIntent(input: { organisationId: CanonicalId; actor: MyceliumActor; text: string }): Promise<StoredCommandReceipt> {
    return this.db.transaction().execute(async (trx) => {
      const id = randomUUID();
      const row = await trx.insertInto("mycelium.intents").values({ id, organisation_id: input.organisationId, requested_by_actor_type: input.actor.type, requested_by_actor_id: input.actor.id, text: input.text, status: "DRAFT" }).returning(["id", "version", "updated_at"]).executeTakeFirstOrThrow();
      await this.record(trx, { organisationId: input.organisationId, actor: input.actor, eventType: "mycelium.intent.created", aggregateType: "mycelium.intent", aggregateId: id, version: row.version, payload: { text: input.text } });
      return { id: canonical(row.id), version: row.version, acceptedAt: row.updated_at };
    });
  }

  async getPlan(organisationId: CanonicalId, planId: CanonicalId): Promise<StoredPlan | undefined> {
    const row = await this.db.selectFrom("mycelium.execution_plans").select(["id", "organisation_id", "status", "version"]).where("organisation_id", "=", organisationId).where("id", "=", planId).executeTakeFirst();
    return row ? { id: canonical(row.id), organisationId: canonical(row.organisation_id), status: row.status, version: row.version } : undefined;
  }

  async confirmPlan(input: { organisationId: CanonicalId; planId: CanonicalId; actor: MyceliumActor }): Promise<StoredCommandReceipt> {
    return this.db.transaction().execute(async (trx) => {
      const row = await trx.updateTable("mycelium.execution_plans").set({ status: "CONFIRMED", confirmed_by_actor_type: input.actor.type, confirmed_by_actor_id: input.actor.id, confirmed_at: new Date(), version: sql<number>`version + 1`, updated_at: new Date() }).where("organisation_id", "=", input.organisationId).where("id", "=", input.planId).where("status", "=", "PREVIEW").returning(["id", "version", "updated_at"]).executeTakeFirst();
      if (!row) throw new Error("plan confirmation lost its PREVIEW precondition");
      await this.record(trx, { organisationId: input.organisationId, actor: input.actor, eventType: "mycelium.plan.confirmed", aggregateType: "mycelium.execution_plan", aggregateId: row.id, version: row.version, payload: { planId: row.id } });
      return { id: canonical(row.id), version: row.version, acceptedAt: row.updated_at };
    });
  }

  async getWorkUnit(organisationId: CanonicalId, workUnitId: CanonicalId): Promise<StoredWorkUnit | undefined> {
    const row = await this.db.selectFrom("mycelium.work_units").select(["id", "organisation_id", "status", "plan_id", "version"]).where("organisation_id", "=", organisationId).where("id", "=", workUnitId).executeTakeFirst();
    return row ? { id: canonical(row.id), organisationId: canonical(row.organisation_id), status: row.status, planId: canonical(row.plan_id), version: row.version } : undefined;
  }

  async dispatchWorkUnit(input: { organisationId: CanonicalId; workUnitId: CanonicalId; workerId: CanonicalId; actor: MyceliumActor }): Promise<StoredCommandReceipt> {
    return this.db.transaction().execute(async (trx) => {
      const worker = await trx.selectFrom("agents.instances").select(["id", "role_version_id", "status"]).where("organisation_id", "=", input.organisationId).where("id", "=", input.workerId).executeTakeFirst();
      if (!worker || (worker.status !== "AVAILABLE" && worker.status !== "WAITING")) throw new Error("assigned worker is unavailable or belongs to another organisation");
      const row = await trx.updateTable("mycelium.work_units").set({ status: "QUEUED", assigned_worker_id: worker.id, role_version_id: worker.role_version_id, version: sql<number>`version + 1`, updated_at: new Date() }).where("organisation_id", "=", input.organisationId).where("id", "=", input.workUnitId).where((eb) => eb.or([eb("status", "=", "DRAFT"), eb("status", "=", "REVISION_REQUIRED")])).returning(["id", "version", "updated_at"]).executeTakeFirst();
      if (!row) throw new Error("work-unit dispatch lost its state precondition");
      await this.record(trx, { organisationId: input.organisationId, actor: input.actor, eventType: "mycelium.work-unit.dispatched", aggregateType: "mycelium.work_unit", aggregateId: row.id, version: row.version, payload: { workUnitId: row.id, workerId: worker.id } });
      return { id: canonical(row.id), version: row.version, acceptedAt: row.updated_at };
    });
  }

  async getRun(organisationId: CanonicalId, runId: CanonicalId): Promise<StoredRun | undefined> {
    const row = await this.db.selectFrom("mycelium.runs").select(["id", "organisation_id", "work_unit_id", "worker_id", "status"]).where("organisation_id", "=", organisationId).where("id", "=", runId).executeTakeFirst();
    return row ? { id: canonical(row.id), organisationId: canonical(row.organisation_id), workUnitId: canonical(row.work_unit_id), workerId: canonical(row.worker_id), status: row.status } : undefined;
  }

  async submitCriticReview(input: { organisationId: CanonicalId; workUnitId: CanonicalId; runId: CanonicalId; criticWorkerId: CanonicalId; actor: MyceliumActor; outcome: "PASS" | "REVISE" | "ESCALATE"; rationale: string }): Promise<StoredCommandReceipt> {
    return this.db.transaction().execute(async (trx) => {
      // Re-establish cross-record ownership inside the mutation transaction;
      // foreign keys alone do not prove a run and review share a tenant/work unit.
      const [run, critic] = await Promise.all([
        trx.selectFrom("mycelium.runs").select(["id", "worker_id", "status"]).where("organisation_id", "=", input.organisationId).where("id", "=", input.runId).where("work_unit_id", "=", input.workUnitId).executeTakeFirst(),
        trx.selectFrom("agents.instances").select("id").where("organisation_id", "=", input.organisationId).where("id", "=", input.criticWorkerId).executeTakeFirst(),
      ]);
      if (!run || run.status !== "SUCCEEDED") throw new Error("Critic review run is not a succeeded run of this work unit");
      if (!critic) throw new Error("Critic worker does not belong to this organisation");
      if (run.worker_id === input.criticWorkerId) throw new Error("executor cannot review its own run");

      const reviewId = randomUUID();
      await trx.insertInto("mycelium.critic_reviews").values({ id: reviewId, organisation_id: input.organisationId, work_unit_id: input.workUnitId, run_id: input.runId, critic_worker_id: input.criticWorkerId, outcome: input.outcome, rationale: input.rationale }).execute();
      const status = workUnitStatusForCriticOutcome(input.outcome);
      const row = await trx.updateTable("mycelium.work_units").set({ status, version: sql<number>`version + 1`, updated_at: new Date() }).where("organisation_id", "=", input.organisationId).where("id", "=", input.workUnitId).where("status", "=", "AWAITING_REVIEW").returning(["id", "version", "updated_at"]).executeTakeFirst();
      if (!row) throw new Error("Critic review lost its AWAITING_REVIEW lifecycle precondition");
      await this.record(trx, { organisationId: input.organisationId, actor: input.actor, eventType: "mycelium.critic.review-recorded", aggregateType: "mycelium.work_unit", aggregateId: row.id, version: row.version, payload: { reviewId, runId: input.runId, criticWorkerId: input.criticWorkerId, outcome: input.outcome } });
      return { id: canonical(reviewId), version: row.version, acceptedAt: row.updated_at };
    });
  }

  async submitGuardianVerdict(input: { organisationId: CanonicalId; workUnitId: CanonicalId; runId?: CanonicalId; actor: MyceliumActor; outcome: "ACCEPT" | "REVISE" | "ESCALATE" | "REJECT"; rationale: string; evidenceIds: CanonicalId[] }): Promise<StoredCommandReceipt> {
    return this.db.transaction().execute(async (trx) => {
      if (input.outcome === "ACCEPT" && input.evidenceIds.length === 0) throw new Error("Guardian acceptance requires evidence");
      if (input.evidenceIds.length > 0) {
        const evidence = await trx.selectFrom("mycelium.evidence").select("id").where("organisation_id", "=", input.organisationId).where("work_unit_id", "=", input.workUnitId).where("id", "in", input.evidenceIds).execute();
        if (evidence.length !== new Set(input.evidenceIds).size) throw new Error("Guardian evidence must belong to the reviewed work unit");
      }
      const decisionId = randomUUID();
      await trx.insertInto("mycelium.guardian_decisions").values({ id: decisionId, organisation_id: input.organisationId, work_unit_id: input.workUnitId, run_id: input.runId ?? null, guardian_actor_type: input.actor.type, guardian_actor_id: input.actor.id, outcome: input.outcome, rationale: input.rationale, evidence_ids: input.evidenceIds as unknown[] }).execute();
      const status = input.outcome === "ACCEPT" ? "ACCEPTED" : input.outcome === "REVISE" ? "REVISION_REQUIRED" : input.outcome === "ESCALATE" ? "ESCALATED" : "BLOCKED";
      const row = await trx.updateTable("mycelium.work_units").set({ status, version: sql<number>`version + 1`, updated_at: new Date() }).where("organisation_id", "=", input.organisationId).where("id", "=", input.workUnitId).returning(["id", "version", "updated_at"]).executeTakeFirst();
      if (!row) throw new Error("reviewed work unit disappeared during Guardian verdict");
      await this.record(trx, { organisationId: input.organisationId, actor: input.actor, eventType: "mycelium.guardian.verdict-recorded", aggregateType: "mycelium.work_unit", aggregateId: row.id, version: row.version, payload: { decisionId, outcome: input.outcome, runId: input.runId ?? null, evidenceIds: input.evidenceIds } });
      return { id: canonical(row.id), version: row.version, acceptedAt: row.updated_at };
    });
  }

  private async record(trx: Transaction<Database>, input: { organisationId: CanonicalId; actor: MyceliumActor; eventType: string; aggregateType: string; aggregateId: string; version: number; payload: unknown }): Promise<void> {
    const event: DomainEvent = { id: randomUUID(), type: input.eventType, version: input.version, organisationId: input.organisationId as unknown as DomainEvent["organisationId"], aggregateType: input.aggregateType, aggregateId: input.aggregateId, actor: actorRef(input.actor), payload: input.payload, occurredAt: new Date().toISOString() };
    await writeOutboxEvent(trx, event);
    await trx.insertInto("audit.events").values({ id: randomUUID(), organisation_id: input.organisationId, actor_type: input.actor.type, actor_id: input.actor.id, action: input.eventType, resource_type: input.aggregateType, resource_id: input.aggregateId, request_id: null, workflow_run_id: null, agent_run_id: null, metadata: input.payload }).execute();
  }
}
