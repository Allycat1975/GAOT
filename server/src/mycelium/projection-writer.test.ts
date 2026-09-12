import { describe, expect, it } from "vitest";
import {
  MyceliumProjectionWriter,
  ProjectionWriteError,
  type CanonicalProjectionUpdate,
  type ProjectionBinding,
  type ProjectionBindingStore,
} from "./projection-writer.js";

const update = (overrides: Partial<CanonicalProjectionUpdate<{ title: string }>> = {}): CanonicalProjectionUpdate<{ title: string }> => ({
  canonicalSystem: "mycelium",
  canonicalId: "work-unit-1",
  projectionKind: "work-unit",
  companyId: "company-1",
  localTargetKind: "issue",
  localTargetId: "issue-1",
  canonicalVersion: "1",
  sourceHash: "hash-1",
  observedAt: new Date("2026-09-12T00:00:00Z"),
  eventId: "event-1",
  record: { title: "Canonical title" },
  ...overrides,
});

function fixture(existing: ProjectionBinding | null = null) {
  let canonical = existing;
  let local = existing;
  const store: ProjectionBindingStore = {
    findCanonical: async () => canonical,
    findLocalTarget: async () => local,
    create: async (binding) => { canonical = binding; local = binding; },
    updateMetadata: async (binding) => { canonical = binding; local = binding; },
  };
  const applied: CanonicalProjectionUpdate["record"][] = [];
  return { store, applied, writer: new MyceliumProjectionWriter(store, { apply: async (target) => { applied.push(target.record); } }) };
}

describe("MyceliumProjectionWriter", () => {
  it("applies a canonical projection then records its binding", async () => {
    const test = fixture();
    await expect(test.writer.reconcile(update())).resolves.toBe("applied");
    expect(test.applied).toEqual([{ title: "Canonical title" }]);
  });

  it("rejects an older event without changing the GAOT presentation target", async () => {
    const test = fixture({ ...withoutRecord(update()), canonicalVersion: "4", sourceHash: "hash-4", eventId: "event-4" });
    await expect(test.writer.reconcile(update({ canonicalVersion: "3", sourceHash: "hash-3" }))).resolves.toBe("stale");
    expect(test.applied).toEqual([]);
  });

  it("treats an equal-version, equal-hash delivery as an idempotent duplicate", async () => {
    const test = fixture(withoutRecord(update()));
    await expect(test.writer.reconcile(update({ eventId: "redelivery" }))).resolves.toBe("duplicate");
    expect(test.applied).toEqual([]);
  });

  it("rejects conflicting content or re-pointing for a canonical binding", async () => {
    const test = fixture(withoutRecord(update()));
    await expect(test.writer.reconcile(update({ sourceHash: "different" }))).rejects.toBeInstanceOf(ProjectionWriteError);
    await expect(test.writer.reconcile(update({ canonicalVersion: "2", localTargetId: "issue-2", sourceHash: "hash-2" }))).rejects.toBeInstanceOf(ProjectionWriteError);
    expect(test.applied).toEqual([]);
  });
});

function withoutRecord(value: CanonicalProjectionUpdate): ProjectionBinding {
  const { record: _record, ...binding } = value;
  return binding;
}
