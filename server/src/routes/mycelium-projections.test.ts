import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { HttpMyceliumReadClient } from "../mycelium/client.js";
import { myceliumProjectionRoutes } from "./mycelium-projections.js";

const token = "x".repeat(32);

function appWith(response: Response, canonicalCompanyId: string | null = "myci", lastKnown?: any) {
  const app = express();
  app.use((req, _res, next) => { req.actor = { type: "board", source: "local_implicit", isInstanceAdmin: true, companyIds: [], userId: "operator" } as any; next(); });
  const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(response);
  const client = new HttpMyceliumReadClient({ baseUrl: "http://127.0.0.1:3200", bearerToken: token, fetchImplementation });
  app.use(myceliumProjectionRoutes(client, { canonicalCompanyId: async () => canonicalCompanyId }, lastKnown));
  app.use((error: { status?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(error.status ?? 500).json({ error: error.message }));
  return app;
}

describe("Mycelium projection routes", () => {
  it("serves a board-authorised canonical company projection", async () => {
    const app = appWith(new Response(JSON.stringify({ canonicalId: "myci", canonicalVersion: 1, sourceHash: "hash", observedAt: "2026-01-01T00:00:00.000Z", name: "MYCI", status: "ACTIVE" }), { status: 200 }));
    const response = await request(app).get("/mycelium/companies/gaot-company-id");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ canonicalId: "myci", name: "MYCI" });
  });

  it("serves the binding-scoped last-known projection when Mycelium is unavailable", async () => {
    const app = appWith(new Response(JSON.stringify({ error: "canonical_state_unavailable" }), { status: 503 }));
    const response = await request(app).get("/mycelium/companies/gaot-company-id");
    expect(response.status).toBe(503);

    const fallback = appWith(
      new Response(JSON.stringify({ error: "canonical_state_unavailable" }), { status: 503 }),
      "myci",
      { getCompany: async () => ({ canonicalId: "myci", canonicalVersion: 7, sourceHash: "cached", observedAt: "2026-01-01T00:00:00.000Z", name: "Cached MYCI", status: "ACTIVE" }) },
    );
    const cached = await request(fallback).get("/mycelium/companies/gaot-company-id");
    expect(cached.status).toBe(200);
    expect(cached.body).toMatchObject({ canonicalId: "myci", name: "Cached MYCI" });
  });

  it("does not expose a canonical endpoint when the selected GAOT company is not bound", async () => {
    const app = appWith(new Response(JSON.stringify({ status: "live", observedAt: "2026-01-01T00:00:00.000Z" }), { status: 200 }), null);
    const response = await request(app).get("/mycelium/companies/gaot-company-id/workers");
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: "mycelium_projection_not_bound" });
  });
});
