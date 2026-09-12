import { and, eq } from "drizzle-orm";
import { genesisProjectionBindings, type Db } from "@paperclipai/db";

/**
 * The only GAOT-side write path for a Mycelium projection.  It owns binding
 * metadata, not canonical data: `apply` is deliberately a target-local port
 * and this module never imports a Mycelium command client or repository.
 */
export type CanonicalProjectionUpdate<T = unknown> = {
  canonicalSystem: "mycelium";
  canonicalId: string;
  projectionKind: string;
  companyId: string;
  localTargetKind: string;
  localTargetId: string;
  canonicalVersion: string;
  sourceHash: string;
  observedAt: Date;
  eventId: string;
  record: T;
};

export type ProjectionBinding = Omit<CanonicalProjectionUpdate<never>, "record">;

export type ProjectionBindingStore = {
  findCanonical(update: Pick<CanonicalProjectionUpdate, "canonicalSystem" | "canonicalId" | "projectionKind">): Promise<ProjectionBinding | null>;
  findLocalTarget(update: Pick<CanonicalProjectionUpdate, "companyId" | "localTargetKind" | "localTargetId">): Promise<ProjectionBinding | null>;
  create(binding: ProjectionBinding): Promise<void>;
  updateMetadata(binding: ProjectionBinding): Promise<void>;
};

/** A writer can only mutate its named GAOT presentation target. */
export type GaotProjectionTargetWriter<T> = {
  apply(target: Pick<CanonicalProjectionUpdate<T>, "companyId" | "localTargetKind" | "localTargetId" | "projectionKind" | "record">): Promise<void>;
};

export type VersionComparator = (incoming: string, current: string) => number;

export type ProjectionWriteResult = "applied" | "duplicate" | "stale";

export class ProjectionWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectionWriteError";
  }
}

/**
 * Reconciles an authoritative event into one GAOT target.  The target writer
 * runs before binding metadata is advanced, so a failed presentation write
 * remains retryable.  Existing bindings may never be re-pointed.
 */
export class MyceliumProjectionWriter<T = unknown> {
  constructor(
    private readonly bindings: ProjectionBindingStore,
    private readonly targetWriter: GaotProjectionTargetWriter<T>,
    private readonly compareVersions: VersionComparator = compareDecimalVersions,
  ) {}

  async reconcile(update: CanonicalProjectionUpdate<T>): Promise<ProjectionWriteResult> {
    validateUpdate(update);
    const current = await this.bindings.findCanonical(update);

    if (current) {
      assertSameTarget(current, update);
      const order = this.compareVersions(update.canonicalVersion, current.canonicalVersion);
      if (order < 0) return "stale";
      if (order === 0) {
        if (update.sourceHash !== current.sourceHash) {
          throw new ProjectionWriteError("A canonical version may not resolve to different projection content");
        }
        return "duplicate";
      }
    } else {
      const target = await this.bindings.findLocalTarget(update);
      if (target) {
        throw new ProjectionWriteError("A GAOT presentation target is already bound to another canonical projection");
      }
    }

    await this.targetWriter.apply({
      companyId: update.companyId,
      localTargetKind: update.localTargetKind,
      localTargetId: update.localTargetId,
      projectionKind: update.projectionKind,
      record: update.record,
    });

    const metadata = withoutRecord(update);
    if (current) await this.bindings.updateMetadata(metadata);
    else await this.bindings.create(metadata);
    return "applied";
  }
}

/** Default fail-closed ordering for Mycelium's monotonically increasing versions. */
export function compareDecimalVersions(incoming: string, current: string): number {
  if (!/^\d+$/.test(incoming) || !/^\d+$/.test(current)) {
    throw new ProjectionWriteError("Canonical projection versions must be unsigned decimal integers");
  }
  const next = BigInt(incoming);
  const previous = BigInt(current);
  return next === previous ? 0 : next > previous ? 1 : -1;
}

export function createDrizzleProjectionBindingStore(db: Db): ProjectionBindingStore {
  return {
    async findCanonical(key) {
      const [row] = await db.select().from(genesisProjectionBindings).where(and(
        eq(genesisProjectionBindings.canonicalSystem, key.canonicalSystem),
        eq(genesisProjectionBindings.canonicalId, key.canonicalId),
        eq(genesisProjectionBindings.projectionKind, key.projectionKind),
      )).limit(1);
      return row ? fromRow(row) : null;
    },
    async findLocalTarget(target) {
      const [row] = await db.select().from(genesisProjectionBindings).where(and(
        eq(genesisProjectionBindings.companyId, target.companyId),
        eq(genesisProjectionBindings.localTargetKind, target.localTargetKind),
        eq(genesisProjectionBindings.localTargetId, target.localTargetId),
      )).limit(1);
      return row ? fromRow(row) : null;
    },
    async create(binding) {
      await db.insert(genesisProjectionBindings).values(toRow(binding));
    },
    async updateMetadata(binding) {
      await db.update(genesisProjectionBindings).set({
        canonicalVersion: binding.canonicalVersion,
        sourceHash: binding.sourceHash,
        observedAt: binding.observedAt,
        lastAppliedEventId: binding.eventId,
        updatedAt: new Date(),
      }).where(and(
        eq(genesisProjectionBindings.canonicalSystem, binding.canonicalSystem),
        eq(genesisProjectionBindings.canonicalId, binding.canonicalId),
        eq(genesisProjectionBindings.projectionKind, binding.projectionKind),
      ));
    },
  };
}

function validateUpdate(update: CanonicalProjectionUpdate): void {
  for (const [name, value] of Object.entries(withoutRecord(update))) {
    if (value instanceof Date) {
      if (Number.isNaN(value.valueOf())) throw new ProjectionWriteError(`${name} must be a valid date`);
    } else if (!value) {
      throw new ProjectionWriteError(`${name} is required`);
    }
  }
  // Validate even for a first event; this prevents an invalid version being persisted.
  compareDecimalVersions(update.canonicalVersion, "0");
}

function assertSameTarget(current: ProjectionBinding, update: CanonicalProjectionUpdate): void {
  if (current.companyId !== update.companyId || current.localTargetKind !== update.localTargetKind || current.localTargetId !== update.localTargetId) {
    throw new ProjectionWriteError("A canonical projection binding may not be re-pointed to a different GAOT target");
  }
}

function withoutRecord(update: CanonicalProjectionUpdate): ProjectionBinding {
  const { record: _record, ...metadata } = update;
  return metadata;
}

function fromRow(row: typeof genesisProjectionBindings.$inferSelect): ProjectionBinding {
  return {
    canonicalSystem: "mycelium",
    canonicalId: row.canonicalId,
    projectionKind: row.projectionKind,
    companyId: row.companyId,
    localTargetKind: row.localTargetKind,
    localTargetId: row.localTargetId,
    canonicalVersion: row.canonicalVersion ?? "0",
    sourceHash: row.sourceHash ?? "",
    observedAt: row.observedAt,
    eventId: row.lastAppliedEventId ?? "",
  };
}

function toRow(binding: ProjectionBinding) {
  return {
    companyId: binding.companyId,
    canonicalSystem: binding.canonicalSystem,
    canonicalId: binding.canonicalId,
    projectionKind: binding.projectionKind,
    localTargetKind: binding.localTargetKind,
    localTargetId: binding.localTargetId,
    canonicalVersion: binding.canonicalVersion,
    sourceHash: binding.sourceHash,
    observedAt: binding.observedAt,
    lastAppliedEventId: binding.eventId,
  };
}
