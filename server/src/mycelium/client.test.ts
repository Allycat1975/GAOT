import { describe, expect, it, vi } from "vitest";
import { HttpMyceliumReadClient, MyceliumApiError } from "./client.js";

const token = "x".repeat(32);

describe("HttpMyceliumReadClient", () => {
  it("uses bearer authentication and validates a canonical company projection", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ canonicalId: "company-1", canonicalVersion: 1, sourceHash: "hash", observedAt: "2026-01-01T00:00:00.000Z", name: "MYCI", status: "ACTIVE" }), { status: 200 }));
    const client = new HttpMyceliumReadClient({ baseUrl: "http://127.0.0.1:3200/", bearerToken: token, fetchImplementation });
    await expect(client.getCompany("company-1")).resolves.toMatchObject({ name: "MYCI" });
    expect(fetchImplementation.mock.calls[0]?.[1]?.headers).toMatchObject({ authorization: `Bearer ${token}` });
  });

  it("rejects non-loopback HTTP endpoints", () => {
    expect(() => new HttpMyceliumReadClient({ baseUrl: "http://mycelium.example", bearerToken: token })).toThrow("HTTPS");
  });

  it("fails closed on an invalid response body", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const client = new HttpMyceliumReadClient({ baseUrl: "http://localhost:3200", bearerToken: token, fetchImplementation });
    await expect(client.inspect()).rejects.toEqual(new MyceliumApiError(502, "invalid_canonical_projection"));
  });
});
