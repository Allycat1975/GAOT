import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  MyceliumProjectionWriter,
  type ProjectionBinding,
} from "../mycelium/projection-writer.js";
import { myceliumProjectionIngestRoutes } from "./mycelium-projection-ingest.js";

function harness() {
  const bindings: ProjectionBinding[] = [];
  const apply = vi.fn(async () => undefined);
  const writer = new MyceliumProjectionWriter(
    {
      findCanonical: async (key) => bindings.find((b) => b.canonicalSystem === key.canonicalSystem && b.canonicalId === key.canonicalId && b.projectionKind === key.projectionKind) ?? null,
      findLocalTarget: async (key) => bindings.find((b) => b.companyId === key.companyId && b.localTargetKind === key.localTargetKind && b.localTargetId === key.localTargetId) ?? null,
      create: async (binding) => { bindings.push(binding); },
      updateMetadata: async (binding) => {
        const index = bindings.findIndex((b) => b.canonicalId === binding.canonicalId && b.projectionKind === binding.projectionKind);
        bindings[index] = binding;
      },
    },
    { apply },
  );
  const app = express();
  app.use(express.json());
  app.use("/v1", myceliumProjectionIngestRoutes(writer, "x".repeat(32)));
  return { app, apply };
}

const update = {
  canonicalSystem: "mycelium",
  canonicalId: "wu-1",
  projectionKind: "work_unit",
  companyId: "co-1",
  localTargetKind: "issue",
  localTargetId: "iss-1",
  canonicalVersion: "1",
  sourceHash: "hash-1",
  observedAt: "2026-09-13T10:00:00.000Z",
  eventId: "evt-1",
  record: { title: "Projected" },
};

describe("Mycelium projection ingress", () => {
  it("rejects unauthenticated donor traffic and applies authenticated updates", async () => {
    const { app, apply } = harness();
    expect((await request(app).post("/v1/mycelium/projections/reconcile").send(update)).status).toBe(401);
    const response = await request(app)
      .post("/v1/mycelium/projections/reconcile")
      .set("Authorization", `Bearer ${"x".repeat(32)}`)
      .send(update);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ result: "applied" });
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ localTargetId: "iss-1" }));
  });

  it("returns duplicate for replayed content without a second target write", async () => {
    const { app, apply } = harness();
    const auth = { Authorization: `Bearer ${"x".repeat(32)}` };
    expect((await request(app).post("/v1/mycelium/projections/reconcile").set(auth).send(update)).status).toBe(200);
    expect((await request(app).post("/v1/mycelium/projections/reconcile").set(auth).send(update)).status).toBe(202);
    expect(apply).toHaveBeenCalledTimes(1);
  });
});
