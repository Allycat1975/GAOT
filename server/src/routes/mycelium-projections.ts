import { Router, type NextFunction, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { genesisProjectionBindings, type Db } from "@paperclipai/db";
import { HttpError } from "../errors.js";
import { HttpMyceliumReadClient, MyceliumApiError } from "../mycelium/client.js";
import type { LastKnownProjectionPort } from "../mycelium/last-known-projections.js";
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
  lastKnown?: LastKnownProjectionPort,
): Router {
  const router = Router();
  router.get("/mycelium/health", asyncRoute(async (req, res) => {
    assertBoard(req);
    try { res.json(await client.inspect()); }
    catch (error) {
      if (error instanceof MyceliumApiError && error.status >= 500) {
        res.json({ status: "offline", observedAt: new Date().toISOString() });
        return;
      }
      throw error;
    }
  }));
  router.get("/mycelium/companies/:companyId", asyncRoute(async (req, res) => {
    const scope = await companyScope(req, bindings);
    res.json(await withLastKnown(
      () => client.getCompany(scope.canonicalCompanyId),
      () => lastKnown?.getCompany(scope.canonicalCompanyId),
    ));
  }));
  router.get("/mycelium/companies/:companyId/workers", collectionRoute(bindings, client.listWorkers.bind(client), bindReader(lastKnown, "listWorkers")));
  router.get("/mycelium/companies/:companyId/goals", collectionRoute(bindings, client.listGoals.bind(client), bindReader(lastKnown, "listGoals")));
  router.get("/mycelium/companies/:companyId/work-units", collectionRoute(bindings, client.listWorkUnits.bind(client), bindReader(lastKnown, "listWorkUnits")));
  router.get("/mycelium/companies/:companyId/runs", collectionRoute(bindings, client.listRuns.bind(client), bindReader(lastKnown, "listRuns")));
  router.get("/mycelium/companies/:companyId/activity", collectionRoute(bindings, client.listActivity.bind(client), bindReader(lastKnown, "listActivity")));
  router.get("/mycelium/companies/:companyId/costs", collectionRoute(bindings, client.listCosts.bind(client), bindReader(lastKnown, "listCosts")));
  router.get("/mycelium/companies/:companyId/evidence", collectionRoute(bindings, client.listEvidence.bind(client), bindReader(lastKnown, "listEvidence")));
  return router;
}

type CompanyScope = { localCompanyId: string; canonicalCompanyId: string };

function bindReader<K extends keyof LastKnownProjectionPort>(port: LastKnownProjectionPort | undefined, key: K) {
  const reader = port?.[key];
  return typeof reader === "function" ? reader.bind(port) : undefined;
}

async function companyScope(req: Request, bindings: MyceliumCompanyBindingLookup): Promise<CompanyScope> {
  assertBoard(req);
  const localCompanyId = typeof req.params.companyId === "string" ? req.params.companyId : req.params.companyId?.[0];
  if (!localCompanyId) throw new HttpError(400, "Company ID is required");
  assertCompanyAccess(req, localCompanyId);
  const canonicalCompanyId = await bindings.canonicalCompanyId(localCompanyId);
  if (!canonicalCompanyId) throw new HttpError(404, "mycelium_projection_not_bound");
  return { localCompanyId, canonicalCompanyId };
}

function collectionRoute(
  bindings: MyceliumCompanyBindingLookup,
  read: (companyId: string) => Promise<unknown>,
  fallback?: (companyId: string) => Promise<unknown> | undefined,
) {
  return asyncRoute(async (req, res) => {
    const scope = await companyScope(req, bindings);
    res.json(await withLastKnown(() => read(scope.canonicalCompanyId), () => fallback?.(scope.canonicalCompanyId)));
  });
}

async function withLastKnown<T>(live: () => Promise<T>, fallback: () => Promise<T | undefined> | undefined): Promise<T> {
  try { return await live(); }
  catch (error) {
    if (error instanceof MyceliumApiError && error.status >= 500) {
      const value = await fallback();
      if (value !== undefined) return value;
    }
    throw error;
  }
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
