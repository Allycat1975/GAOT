import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { HttpMyceliumReadClient } from "../mycelium/client.js";
import { myceliumProjectionRoutes } from "./mycelium-projections.js";

const token = "x".repeat(32);

function appWith(response: Response) {
  const app = express();
  app.use((req, _res, next) => { req.actor = { type: "board", source: "local_implicit", isInstanceAdmin: true, companyIds: [], userId: "operator" } as any; next(); });
  const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(response);
  const client = new HttpMyceliumReadClient({ baseUrl: "http://127.0.0.1:3200", bearerToken: token, fetchImplementation });
  app.use(myceliumProjectionRoutes(client));
  app.use((error: { status?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(error.status ?? 500).json({ error: error.message }));
  return app;
}

describe("Mycelium projection routes", () => {
  it("serves a board-authorised canonical company projection", async () => {
    const app = appWith(new Response(JSON.stringify({ canonicalId: "myci", canonicalVersion: 1, sourceHash: "hash", observedAt: "2026-01-01T00:00:00.000Z", name: "MYCI", status: "ACTIVE" }), { status: 200 }));
    const response = await request(app).get("/mycelium/companies/myci");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ canonicalId: "myci", name: "MYCI" });
  });

  it("does not fall back to donor state when Mycelium is unavailable", async () => {
    const app = appWith(new Response(JSON.stringify({ error: "canonical_state_unavailable" }), { status: 503 }));
    const response = await request(app).get("/mycelium/companies/myci");
    expect(response.status).toBe(503);
  });
});
