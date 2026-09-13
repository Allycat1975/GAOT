import { describe, expect, it } from "vitest";
import { createGaotProjectionTargetWriter } from "./projection-target-writer.js";

function dbReturning(rows: { id: string }[] = [{ id: "local-1" }]) {
  const returning = async () => rows;
  const where = () => ({ returning });
  const set = () => ({ where });
  return { update: () => ({ set }), insert: () => ({ values: () => ({ returning }) }) } as never;
}

const base = { companyId: "company-1", localTargetId: "local-1", projectionKind: "issue" };

describe("GAOT concrete Mycelium projection targets", () => {
  it("updates every supported bound presentation target", async () => {
    const writer = createGaotProjectionTargetWriter(dbReturning());
    const cases = [
      ["company", { name: "MYCI", status: "ACTIVE" }],
      ["agent", { displayName: "Worker", status: "AVAILABLE" }],
      ["goal", { title: "Goal", description: "Canonical", status: "ACTIVE" }],
      ["issue", { title: "Work", description: "Canonical", status: "AWAITING_REVIEW" }],
      ["heartbeat-run", { status: "SUCCEEDED" }],
      ["document", { kind: "REPORT", uri: "mycelium://evidence/1" }],
      ["cost-event", { amountMinor: 12, sourceKind: "MODEL_USAGE", occurredAt: "2026-09-13T00:00:00.000Z" }],
      ["activity", { type: "workunit.changed", summary: "mycelium.work_unit.workunit.changed", occurredAt: "2026-09-13T00:00:00.000Z" }],
    ] as const;
    for (const [localTargetKind, record] of cases) {
      const target = localTargetKind === "company"
        ? { ...base, localTargetId: base.companyId }
        : localTargetKind === "activity"
          ? { ...base, localTargetId: "00000000-0000-4000-8000-000000000001" }
          : base;
      const projectionKind = localTargetKind === "issue"
        ? "work_unit"
        : localTargetKind === "agent"
          ? "worker"
            : localTargetKind === "heartbeat-run"
              ? "run"
              : localTargetKind === "activity"
                ? "event"
              : localTargetKind;
      await expect(writer.apply({ ...target, projectionKind, localTargetKind, record })).resolves.toBeUndefined();
    }
  });

  it("fails closed for unsupported, malformed, or absent targets", async () => {
    const writer = createGaotProjectionTargetWriter(dbReturning([]));
    await expect(writer.apply({ ...base, localTargetKind: "unknown", record: {} })).rejects.toThrow("cannot target");
    await expect(writer.apply({ ...base, projectionKind: "company", localTargetKind: "company", record: { name: "MYCI", status: "ACTIVE" } })).rejects.toThrow("does not match company scope");
    await expect(writer.apply({ ...base, localTargetKind: "issue", record: { title: "Missing status" } })).rejects.toThrow("requires status");
    await expect(writer.apply({ ...base, projectionKind: "worker", localTargetKind: "agent", record: { displayName: "Worker", status: "INVENTED" } })).rejects.toThrow("Unknown canonical worker status");
    await expect(writer.apply({ ...base, projectionKind: "company", localTargetKind: "company", record: { name: "MYCI", status: "ACTIVE" } })).rejects.toThrow("does not match company scope");
  });
});
