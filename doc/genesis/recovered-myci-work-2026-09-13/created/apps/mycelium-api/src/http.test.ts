import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import type { GaotCanonicalId, GaotHealthPort, GaotReadPort } from "@genesis/mycelium-contracts";
import { createMyceliumApi } from "./http.js";

const companyId = "company-1" as GaotCanonicalId;
const readPort: GaotReadPort = {
  async getCompany(id) { return id === companyId ? { canonicalId: id, canonicalVersion: 1, sourceHash: "hash", observedAt: "2026-01-01T00:00:00.000Z", name: "MYCI", status: "ACTIVE" } : undefined; },
  async listWorkers() { return []; },
  async listGoals() { return []; },
  async listWorkUnits() { return []; },
  async listRuns() { return []; },
  async listActivity() { return []; },
  async listCosts() { return []; },
  async listEvidence() { return []; },
};
const healthPort: GaotHealthPort = { async inspect() { return { status: "live", observedAt: "2026-01-01T00:00:00.000Z", version: "test" }; } };
let server: Server | undefined;

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  server = createMyceliumApi({ readPort, healthPort, bearerToken: "x".repeat(32) });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return fetch(`http://127.0.0.1:${address.port}${path}`, init);
}

afterEach(async () => { if (server) await new Promise<void>((resolve) => server?.close(() => resolve())); server = undefined; });

describe("Mycelium API", () => {
  it("denies a request without the canonical API token", async () => {
    const response = await request("/v1/health");
    expect(response.status).toBe(401);
  });

  it("returns a canonical company projection to an authenticated caller", async () => {
    const response = await request(`/v1/companies/${companyId}`, { headers: { authorization: `Bearer ${"x".repeat(32)}` } });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ canonicalId: companyId, name: "MYCI" });
  });

  it("rejects all mutation methods", async () => {
    const response = await request(`/v1/companies/${companyId}`, { method: "POST", headers: { authorization: `Bearer ${"x".repeat(32)}` } });
    expect(response.status).toBe(405);
  });
});
