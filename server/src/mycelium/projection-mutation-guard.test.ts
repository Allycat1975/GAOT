import { describe, expect, it } from "vitest";
import { projectionMutationTarget } from "./projection-mutation-guard.js";

describe("projection mutation route guard", () => {
  it("maps all directly-addressable projection target families", () => {
    expect(projectionMutationTarget("/companies/co-1/archive", "POST")).toEqual({ localTargetKind: "company", localTargetId: "co-1" });
    expect(projectionMutationTarget("/agents/agent-1/pause", "POST")).toEqual({ localTargetKind: "agent", localTargetId: "agent-1" });
    expect(projectionMutationTarget("/goals/goal-1", "PATCH")).toEqual({ localTargetKind: "goal", localTargetId: "goal-1" });
    expect(projectionMutationTarget("/heartbeat-runs/run-1/cancel", "POST")).toEqual({ localTargetKind: "heartbeat-run", localTargetId: "run-1" });
    expect(projectionMutationTarget("/documents/doc-1", "DELETE")).toEqual({ localTargetKind: "document", localTargetId: "doc-1" });
    expect(projectionMutationTarget("/cost-events/cost-1", "PUT")).toEqual({ localTargetKind: "cost-event", localTargetId: "cost-1" });
  });

  it("does not classify reads, creates, or collection routes as target mutations", () => {
    expect(projectionMutationTarget("/companies", "POST")).toBeNull();
    expect(projectionMutationTarget("/companies/co-1/goals", "POST")).toBeNull();
    expect(projectionMutationTarget("/agents/agent-1", "GET")).toBeNull();
    expect(projectionMutationTarget("/goals", "POST")).toBeNull();
  });
});
