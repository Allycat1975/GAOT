import { describe, expect, it } from "vitest";
import { mapWorkUnitStatus, mayPresentDone, type MyceliumWorkUnitStatus } from "./status-mapping.js";

describe("Mycelium WorkUnit presentation mapping", () => {
  it("maps every canonical status and reserves done for Guardian acceptance", () => {
    const expected: Record<MyceliumWorkUnitStatus, string> = {
      DRAFT: "backlog",
      QUEUED: "todo",
      LEASED: "in_progress",
      RUNNING: "in_progress",
      AWAITING_REVIEW: "in_review",
      REVISION_REQUIRED: "in_review",
      ACCEPTED: "done",
      BLOCKED: "blocked",
      ESCALATED: "blocked",
      CANCELLED: "cancelled",
    };

    for (const [canonical, presentation] of Object.entries(expected) as [MyceliumWorkUnitStatus, string][]) {
      expect(mapWorkUnitStatus(canonical)).toBe(presentation);
      expect(mayPresentDone(canonical)).toBe(canonical === "ACCEPTED");
    }
  });
});
