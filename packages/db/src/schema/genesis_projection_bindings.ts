import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * Records the one-way relationship between a Mycelium record and its GAOT
 * presentation target. This table is deliberately metadata only: it cannot
 * become a second copy of canonical state.
 */
export const genesisProjectionBindings = pgTable(
  "genesis_projection_bindings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    canonicalSystem: text("canonical_system").notNull().default("mycelium"),
    canonicalId: text("canonical_id").notNull(),
    projectionKind: text("projection_kind").notNull(),
    localTargetKind: text("local_target_kind").notNull(),
    localTargetId: text("local_target_id").notNull(),
    canonicalVersion: text("canonical_version"),
    sourceHash: text("source_hash"),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
    lastAppliedEventId: text("last_applied_event_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    canonicalProjectionUq: uniqueIndex("genesis_projection_bindings_canonical_uq").on(
      table.canonicalSystem,
      table.canonicalId,
      table.projectionKind,
    ),
    localTargetUq: uniqueIndex("genesis_projection_bindings_local_target_uq").on(
      table.companyId,
      table.localTargetKind,
      table.localTargetId,
    ),
    companyKindIdx: index("genesis_projection_bindings_company_kind_idx").on(
      table.companyId,
      table.projectionKind,
    ),
  }),
);
