import { and, eq } from "drizzle-orm";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { genesisProjectionBindings, type Db } from "@paperclipai/db";

export type ProjectionMutationTarget = {
  localTargetKind: string;
  localTargetId: string;
};

/**
 * Blocks donor mutations for every directly-addressable GAOT presentation
 * target that Mycelium can bind.  This is deliberately a route-shape guard in
 * addition to service guards: it runs before a child route can perform
 * validation, storage, or queue work.
 */
export function myceliumProjectionMutationGuard(db: Db): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      next();
      return;
    }
    const target = resolveProjectionMutationTarget(req.path, req.method);
    if (!target) {
      next();
      return;
    }
    const [binding] = await db
      .select({ id: genesisProjectionBindings.id })
      .from(genesisProjectionBindings)
      .where(and(
        eq(genesisProjectionBindings.canonicalSystem, "mycelium"),
        eq(genesisProjectionBindings.localTargetKind, target.localTargetKind),
        eq(genesisProjectionBindings.localTargetId, target.localTargetId),
      ))
      .limit(1);
    if (!binding) {
      next();
      return;
    }
    res.status(409).json({
      error: "mycelium_projection_target_locked",
      reason: "Mycelium is the sole writer for this bound projection target",
      target,
    });
  };
}

/** Pure route mapping exported for focused coverage without a database. */
export function projectionMutationTarget(path: string, method: string): ProjectionMutationTarget | null {
  return resolveProjectionMutationTarget(path, method);
}

function resolveProjectionMutationTarget(path: string, method: string): ProjectionMutationTarget | null {
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(method)) return null;

  // Company mutation routes are mounted under /companies. Creation and
  // collection operations have no existing target and therefore do not match.
  const company = path.match(/^\/companies\/([^/]+)(?:\/archive)?\/?$/);
  if (company?.[1]) return { localTargetKind: "company", localTargetId: company[1] };

  const agent = path.match(/^\/agents\/([^/]+)(?:\/|$)/);
  if (agent?.[1]) return { localTargetKind: "agent", localTargetId: agent[1] };

  const goal = path.match(/^\/goals\/([^/]+)\/?$/);
  if (goal?.[1]) return { localTargetKind: "goal", localTargetId: goal[1] };

  const run = path.match(/^\/heartbeat-runs\/([^/]+)(?:\/|$)/);
  if (run?.[1]) return { localTargetKind: "heartbeat-run", localTargetId: run[1] };

  const document = path.match(/^\/documents\/([^/]+)(?:\/|$)/);
  if (document?.[1]) return { localTargetKind: "document", localTargetId: document[1] };

  const cost = path.match(/^\/cost-events\/([^/]+)(?:\/|$)/);
  if (cost?.[1]) return { localTargetKind: "cost-event", localTargetId: cost[1] };

  return null;
}
