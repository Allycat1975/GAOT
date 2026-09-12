import { and, eq } from "drizzle-orm";
import { genesisProjectionBindings, issues } from "@paperclipai/db";
import { conflict } from "../errors.js";
import {
  assertGaotMutationAllowed,
  CanonicalProjectionMutationError,
} from "./projection-guard.js";

/**
 * Enforces canonical ownership at the parent issue boundary.  Issue comments,
 * documents, work products, and attachments are all mutable presentation
 * children, so their shared services must check this before changing any of
 * them.  Keep the lookup transaction-local to make the decision and mutation
 * observe the same database state.
 */
export async function assertIssueMutationIsNotCanonicalProjection(
  dbOrTx: any,
  issue: Pick<typeof issues.$inferSelect, "id" | "companyId">,
): Promise<void> {
  try {
    await assertGaotMutationAllowed(
      {
        isBound: async (target) => {
          const [binding] = await dbOrTx
            .select({ id: genesisProjectionBindings.id })
            .from(genesisProjectionBindings)
            .where(
              and(
                eq(genesisProjectionBindings.companyId, target.companyId),
                eq(genesisProjectionBindings.localTargetKind, target.localTargetKind),
                eq(genesisProjectionBindings.localTargetId, target.localTargetId),
                eq(genesisProjectionBindings.canonicalSystem, "mycelium"),
              ),
            )
            .limit(1);
          return Boolean(binding);
        },
      },
      {
        companyId: issue.companyId,
        localTargetKind: "issue",
        localTargetId: issue.id,
      },
    );
  } catch (error) {
    if (error instanceof CanonicalProjectionMutationError) {
      throw conflict(
        "This task is a Mycelium projection and may only be changed by the Mycelium projection writer.",
        { code: "mycelium_projection_mutation_forbidden", issueId: issue.id },
      );
    }
    throw error;
  }
}
