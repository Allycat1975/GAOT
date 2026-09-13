import { timingSafeEqual } from "node:crypto";
import { Router, type Request } from "express";
import { z } from "zod";
import {
  MyceliumProjectionWriter,
  ProjectionWriteError,
  type CanonicalProjectionUpdate,
} from "../mycelium/projection-writer.js";

const projectionUpdateSchema = z.object({
  canonicalSystem: z.literal("mycelium"),
  canonicalId: z.string().trim().min(1),
  projectionKind: z.string().trim().min(1),
  companyId: z.string().trim().min(1),
  localTargetKind: z.string().trim().min(1),
  localTargetId: z.string().trim().min(1),
  canonicalVersion: z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]),
  sourceHash: z.string().trim().min(1),
  observedAt: z.string().datetime({ offset: true }),
  eventId: z.string().trim().min(1),
  record: z.record(z.string(), z.unknown()),
});

/** Authenticated one-way ingress from Mycelium into GAOT presentation state. */
export function myceliumProjectionIngestRoutes(
  writer: MyceliumProjectionWriter<Record<string, unknown>>,
  bearerToken: string,
): Router {
  const router = Router();
  router.post("/mycelium/projections/reconcile", async (req, res, next) => {
    try {
      if (!matchesBearer(req, bearerToken)) {
        res.status(401).json({ error: "unauthorized" });
        return;
      }
      const parsed = projectionUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_projection_update", details: parsed.error.issues });
        return;
      }
      const update: CanonicalProjectionUpdate<Record<string, unknown>> = {
        ...parsed.data,
        canonicalVersion: String(parsed.data.canonicalVersion),
        observedAt: new Date(parsed.data.observedAt),
      };
      const result = await writer.reconcile(update);
      res.status(result === "applied" ? 200 : 202).json({ result });
    } catch (error) {
      if (error instanceof ProjectionWriteError) {
        res.status(409).json({ error: "projection_write_rejected", reason: error.message });
        return;
      }
      next(error);
    }
  });
  return router;
}

function matchesBearer(req: Request, expected: string): boolean {
  if (expected.length < 32) return false;
  const provided = req.get("authorization");
  if (!provided?.startsWith("Bearer ")) return false;
  const candidate = Buffer.from(provided.slice("Bearer ".length));
  const secret = Buffer.from(expected);
  return candidate.length === secret.length && timingSafeEqual(candidate, secret);
}
