import { genesisProjectionBindings, type Db } from "@paperclipai/db";
import { and, eq, inArray } from "drizzle-orm";
import { HttpError } from "../errors.js";

/**
 * A GAOT agent bound to a Mycelium worker is an execution host, not a
 * Paperclip scheduler participant.  The binding is the durable authority
 * signal: no mutable agent metadata is trusted for this decision.
 */
export type MyceliumWorkerControlLookup = {
  isMyceliumControlled(input: {
    companyId: string;
    agentId: string;
  }): Promise<boolean>;
};

export function createMyceliumWorkerControlLookup(db: Db): MyceliumWorkerControlLookup {
  return {
    async isMyceliumControlled({ companyId, agentId }) {
      const [binding] = await db
        .select({ id: genesisProjectionBindings.id })
        .from(genesisProjectionBindings)
        .where(and(
          eq(genesisProjectionBindings.companyId, companyId),
          eq(genesisProjectionBindings.canonicalSystem, "mycelium"),
          eq(genesisProjectionBindings.localTargetId, agentId),
          // "agent" is the Paperclip table name; "worker" permits the
          // domain name used by a projection consumer without weakening the
          // scheduler boundary.
          inArray(genesisProjectionBindings.localTargetKind, ["agent", "worker"]),
        ))
        .limit(1);
      return Boolean(binding);
    },
  };
}

/** A conflict is deliberate: callers must use a governed Mycelium command. */
export async function assertPaperclipWorkerSchedulingAllowed(
  lookup: MyceliumWorkerControlLookup,
  target: { companyId: string; agentId: string },
): Promise<void> {
  if (!await lookup.isMyceliumControlled(target)) return;
  throw new HttpError(409, "mycelium_worker_scheduler_denied", {
    code: "mycelium_worker_scheduler_denied",
    remediation: "Dispatch this worker through a governed Mycelium command; Paperclip heartbeat scheduling is not authoritative.",
  });
}
