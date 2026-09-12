import { Router, type NextFunction, type Request, type Response } from "express";
import { HttpError } from "../errors.js";
import { HttpMyceliumReadClient, MyceliumApiError } from "../mycelium/client.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";

/** Read-only GAOT facade over canonical Mycelium projections. */
export function myceliumProjectionRoutes(client: HttpMyceliumReadClient): Router {
  const router = Router();
  router.get("/mycelium/health", asyncRoute(async (req, res) => { assertBoard(req); res.json(await client.inspect()); }));
  router.get("/mycelium/companies/:companyId", asyncRoute(async (req, res) => { const companyId = companyScope(req); res.json(await client.getCompany(companyId)); }));
  router.get("/mycelium/companies/:companyId/workers", collectionRoute((companyId) => client.listWorkers(companyId)));
  router.get("/mycelium/companies/:companyId/goals", collectionRoute((companyId) => client.listGoals(companyId)));
  router.get("/mycelium/companies/:companyId/work-units", collectionRoute((companyId) => client.listWorkUnits(companyId)));
  router.get("/mycelium/companies/:companyId/runs", collectionRoute((companyId) => client.listRuns(companyId)));
  router.get("/mycelium/companies/:companyId/activity", collectionRoute((companyId) => client.listActivity(companyId)));
  router.get("/mycelium/companies/:companyId/costs", collectionRoute((companyId) => client.listCosts(companyId)));
  router.get("/mycelium/companies/:companyId/evidence", collectionRoute((companyId) => client.listEvidence(companyId)));
  return router;
}

function companyScope(req: Request): string {
  assertBoard(req);
  const companyId = req.params.companyId;
  if (!companyId) throw new HttpError(400, "Company ID is required");
  assertCompanyAccess(req, companyId);
  return companyId;
}

function collectionRoute(read: (companyId: string) => Promise<unknown>) {
  return asyncRoute(async (req, res) => { res.json(await read(companyScope(req))); });
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
