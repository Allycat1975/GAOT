import { Router, type NextFunction, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { genesisProjectionBindings, type Db } from "@paperclipai/db";
import { HttpError } from "../errors.js";
import { HttpMyceliumReadClient, MyceliumApiError } from "../mycelium/client.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";

/**
 * Resolves the UI's GAOT-local company identifier to the canonical Mycelium
 * company identifier. This deliberately keeps canonical IDs out of browser
 * routing: a browser may only request the company it already has GAOT access
 * to, and a missing binding is not treated as donor state.
 */
export type MyceliumCompanyBindingLookup = {
  canonicalCompanyId(localCompanyId: string): Promise<string | null>;
};

export function createMyceliumCompanyBindingLookup(db: Db): MyceliumCompanyBindingLookup {
  return {
    async canonicalCompanyId(localCompanyId) {
      const [binding] = await db
        .select({ canonicalId: genesisProjectionBindings.canonicalId })
        .from(genesisProjectionBindings)
        .where(and(
          eq(genesisProjectionBindings.companyId, localCompanyId),
          eq(genesisProjectionBindings.canonicalSystem, "mycelium"),
          eq(genesisProjectionBindings.projectionKind, "company"),
        ))
        .limit(1);
      return binding?.canonicalId ?? null;
    },
  };
}

/** Read-only GAOT facade over canonical Mycelium projections. */
export function myceliumProjectionRoutes(
  client: HttpMyceliumReadClient,
  bindings: MyceliumCompanyBindingLookup,
): Router {
  const router = Router();
  router.get("/mycelium/health", asyncRoute(async (req, res) => { assertBoard(req); res.json(await client.inspect()); }));
  router.get("/mycelium/companies/:companyId", asyncRoute(async (req, res) => { const companyId = await companyScope(req, bindings); res.json(await client.getCompany(companyId)); }));
  router.get("/mycelium/companies/:companyId/workers", collectionRoute(bindings, (companyId) => client.listWorkers(companyId)));
  router.get("/mycelium/companies/:companyId/goals", collectionRoute(bindings, (companyId) => client.listGoals(companyId)));
  router.get("/mycelium/companies/:companyId/work-units", collectionRoute(bindings, (companyId) => client.listWorkUnits(companyId)));
  router.get("/mycelium/companies/:companyId/runs", collectionRoute(bindings, (companyId) => client.listRuns(companyId)));
  router.get("/mycelium/companies/:companyId/activity", collectionRoute(bindings, (companyId) => client.listActivity(companyId)));
  router.get("/mycelium/companies/:companyId/costs", collectionRoute(bindings, (companyId) => client.listCosts(companyId)));
  router.get("/mycelium/companies/:companyId/evidence", collectionRoute(bindings, (companyId) => client.listEvidence(companyId)));
  return router;
}

async function companyScope(req: Request, bindings: MyceliumCompanyBindingLookup): Promise<string> {
  assertBoard(req);
  const localCompanyId = req.params.companyId;
  if (!localCompanyId) throw new HttpError(400, "Company ID is required");
  assertCompanyAccess(req, localCompanyId);
  const canonicalCompanyId = await bindings.canonicalCompanyId(localCompanyId);
  if (!canonicalCompanyId) throw new HttpError(404, "mycelium_projection_not_bound");
  return canonicalCompanyId;
}

function collectionRoute(bindings: MyceliumCompanyBindingLookup, read: (companyId: string) => Promise<unknown>) {
  return asyncRoute(async (req, res) => { res.json(await read(await companyScope(req, bindings))); });
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void handler(req, res).catch((error: unknown) => {
      if (error instanceof MyceliumApiError) {
        // The GAOT service credential or canonical service is unavailable; do
        // not turn the donor database into a fallback source of truth.
        next(new HttpError(error.status === 404 ? 404 : 503, error.code));
        return;
      }
      next(error);
    });
  };
}
