import { describe, expect, it } from "vitest";
import {
  assertPaperclipWorkerSchedulingAllowed,
  type MyceliumWorkerControlLookup,
} from "./worker-control.js";

describe("Mycelium worker scheduling guard", () => {
  it("returns a 409 denial for a Mycelium-controlled GAOT worker", async () => {
    const lookup: MyceliumWorkerControlLookup = { isMyceliumControlled: async () => true };

    await expect(assertPaperclipWorkerSchedulingAllowed(lookup, {
      companyId: "company-1",
      agentId: "agent-1",
    })).rejects.toMatchObject({
      status: 409,
      message: "mycelium_worker_scheduler_denied",
      details: { code: "mycelium_worker_scheduler_denied" },
    });
  });

  it("allows GAOT-local workers to enter the donor scheduler", async () => {
    const lookup: MyceliumWorkerControlLookup = { isMyceliumControlled: async () => false };
    await expect(assertPaperclipWorkerSchedulingAllowed(lookup, {
      companyId: "company-1",
      agentId: "agent-1",
    })).resolves.toBeUndefined();
  });
});
