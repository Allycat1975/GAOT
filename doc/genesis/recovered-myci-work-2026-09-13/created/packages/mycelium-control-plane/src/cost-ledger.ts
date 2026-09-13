import { randomUUID } from "node:crypto";
import type { Kysely, Transaction } from "kysely";
import type { Database } from "@genesis/database";
import type { ActorRef, DomainEvent } from "@genesis/domain";
import { writeOutboxEvent } from "@genesis/events";
import type { CanonicalId, MyceliumActor } from "@genesis/mycelium-contracts";

export type CostSourceKind = "MODEL_USAGE" | "TOOL_EXECUTION" | "INFRASTRUCTURE";

/** Raw observations supplied by a trusted execution host; never estimates. */
export interface CostObservation {
  organisationId: CanonicalId;
  workUnitId: CanonicalId;
  runId: CanonicalId;
  sourceKind: CostSourceKind;
  /** Provider receipt, execution id, or other durable upstream attribution. */
  sourceReference: string;
  /** Stable per-tenant key from the trusted host, not a generated retry id. */
  idempotencyKey: string;
  amountMinor: number;
  currency: string;
  /** Unmodified structured usage returned by the provider/execution host. */
  usage: Record<string, unknown>;
  observedAt: Date;
  recordedBy: MyceliumActor;
}

export interface CostLedgerReceipt { id: CanonicalId; recordedAt: Date; }

/** This port is intentionally not a MyceliumCommandPort or HTTP handler. */
export interface CostLedgerStore {
  append(observation: CostObservation): Promise<CostLedgerReceipt>;
}

/**
 * A narrow boundary for trusted Tool Gateway/runtime infrastructure.
 * It cannot create estimates, alter entries, or expose a read/write endpoint.
 */
export class TrustedCostLedgerRecorder {
  constructor(private readonly store: CostLedgerStore) {}

  async record(observation: CostObservation): Promise<CostLedgerReceipt> {
    if (!Number.isSafeInteger(observation.amountMinor) || observation.amountMinor < 0) throw new Error("cost amount must be a non-negative safe integer in minor units");
    if (!/^[A-Z]{3}$/.test(observation.currency)) throw new Error("cost currency must be an uppercase ISO-4217 code");
    if (!observation.sourceReference.trim()) throw new Error("cost observation requires a durable source reference");
    if (!observation.idempotencyKey.trim()) throw new Error("cost observation requires a stable idempotency key");
    if (!(observation.observedAt instanceof Date) || Number.isNaN(observation.observedAt.valueOf())) throw new Error("cost observation requires a valid observedAt timestamp");
    if (!observation.usage || Array.isArray(observation.usage)) throw new Error("cost observation usage must be structured provider telemetry");
    return this.store.append({ ...observation, sourceReference: observation.sourceReference.trim(), idempotencyKey: observation.idempotencyKey.trim() });
  }
}

const canonical = (value: string): CanonicalId => value as CanonicalId;
const actorRef = (actor: MyceliumActor): ActorRef => actor as ActorRef;

/** PostgreSQL-only append implementation. No update or delete capability exists. */
export class PostgresCostLedgerStore implements CostLedgerStore {
  constructor(private readonly db: Kysely<Database>) {}

  async append(observation: CostObservation): Promise<CostLedgerReceipt> {
    return this.db.transaction().execute(async (trx) => {
      const id = randomUUID();
      const inserted = await trx.insertInto("mycelium.cost_ledger_entries").values({
        id, organisation_id: observation.organisationId, work_unit_id: observation.workUnitId, run_id: observation.runId,
        source_kind: observation.sourceKind, source_reference: observation.sourceReference, idempotency_key: observation.idempotencyKey,
        amount_minor: observation.amountMinor, currency: observation.currency, usage: observation.usage, observed_at: observation.observedAt,
        recorded_by_actor_type: observation.recordedBy.type, recorded_by_actor_id: observation.recordedBy.id,
      }).onConflict((oc) => oc.columns(["organisation_id", "idempotency_key"]).doNothing()).returning(["id", "recorded_at"]).executeTakeFirst();

      if (!inserted) {
        const existing = await trx.selectFrom("mycelium.cost_ledger_entries").select(["id", "recorded_at", "work_unit_id", "run_id", "source_kind", "source_reference", "amount_minor", "currency"]).where("organisation_id", "=", observation.organisationId).where("idempotency_key", "=", observation.idempotencyKey).executeTakeFirstOrThrow();
        if (existing.work_unit_id !== observation.workUnitId || existing.run_id !== observation.runId || existing.source_kind !== observation.sourceKind || existing.source_reference !== observation.sourceReference || existing.amount_minor !== observation.amountMinor || existing.currency !== observation.currency) throw new Error("cost ledger idempotency key was reused with different observed spend");
        return { id: canonical(existing.id), recordedAt: existing.recorded_at };
      }

      await this.record(trx, id, observation);
      return { id: canonical(inserted.id), recordedAt: inserted.recorded_at };
    });
  }

  private async record(trx: Transaction<Database>, id: string, observation: CostObservation): Promise<void> {
    const payload = { ledgerEntryId: id, workUnitId: observation.workUnitId, runId: observation.runId, sourceKind: observation.sourceKind, sourceReference: observation.sourceReference, amountMinor: observation.amountMinor, currency: observation.currency, observedAt: observation.observedAt.toISOString() };
    const event: DomainEvent = { id: randomUUID(), type: "mycelium.cost.observed", version: 1, organisationId: observation.organisationId as unknown as DomainEvent["organisationId"], aggregateType: "mycelium.cost_ledger_entry", aggregateId: id, actor: actorRef(observation.recordedBy), payload, occurredAt: new Date().toISOString() };
    await writeOutboxEvent(trx, event);
    await trx.insertInto("audit.events").values({ id: randomUUID(), organisation_id: observation.organisationId, actor_type: observation.recordedBy.type, actor_id: observation.recordedBy.id, action: "mycelium.cost.observed", resource_type: "mycelium.cost_ledger_entry", resource_id: id, request_id: null, workflow_run_id: null, agent_run_id: null, metadata: payload }).execute();
  }
}
