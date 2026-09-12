import { describe, expect, it } from "vitest";
import {
  assertGaotMutationAllowed,
  CanonicalProjectionMutationError,
  type ProjectionBindingLookup,
} from "./projection-guard.js";

const issueTarget = {
  companyId: "company-1",
  localTargetKind: "issue",
  localTargetId: "issue-1",
};

describe("assertGaotMutationAllowed", () => {
  it("fails closed for a Mycelium-bound donor record", async () => {
    const bindings: ProjectionBindingLookup = { isBound: async () => true };

    await expect(assertGaotMutationAllowed(bindings, issueTarget)).rejects.toBeInstanceOf(
      CanonicalProjectionMutationError,
    );
  });

  it("permits ordinary GAOT-local records", async () => {
    const bindings: ProjectionBindingLookup = { isBound: async () => false };

    await expect(assertGaotMutationAllowed(bindings, issueTarget)).resolves.toBeUndefined();
  });
});
