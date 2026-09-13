import { describe, expect, it } from "vitest";
import type { CanonicalId, MyceliumActor } from "@genesis/mycelium-contracts";
import { CommandDeniedError, CommandPreconditionError, GovernedMyceliumCommandService } from "./service.js";
import { workUnitStatusForCriticOutcome } from "./postgres-store.js";
import type { CommandAuthorizer, MyceliumCommandStore, StoredCommandReceipt, StoredPlan, StoredRun, StoredWorkUnit } from "./ports.js";

const id = (value: string) => value as CanonicalId;
const org = id("00000000-0000-4000-8000-000000000001");
const human: MyceliumActor = { type: "HUMAN", id: id("00000000-0000-4000-8000-000000000002") };
const worker = id("00000000-0000-4000-8000-000000000003");
const planId = id("00000000-0000-4000-8000-000000000004");
const unitId = id("00000000-0000-4000-8000-000000000005");
const runId = id("00000000-0000-4000-8000-000000000006");
const receipt: StoredCommandReceipt = { id: unitId, version: 2, acceptedAt: new Date("2026-09-12T00:00:00.000Z") };

class Store implements MyceliumCommandStore {
  calls: string[] = [];
  criticInput: { outcome: "PASS" | "REVISE" | "ESCALATE" } | undefined;
  plan: StoredPlan | undefined = { id: planId, organisationId: org, status: "CONFIRMED", version: 1 };
  unit: StoredWorkUnit | undefined = { id: unitId, organisationId: org, status: "DRAFT", planId, version: 1 };
  run: StoredRun | undefined = { id: runId, organisationId: org, workUnitId: unitId, workerId: worker, status: "SUCCEEDED" };
  async createIntent(): Promise<StoredCommandReceipt> { this.calls.push("createIntent"); return receipt; }
  async getPlan(): Promise<StoredPlan | undefined> { return this.plan; }
  async confirmPlan(): Promise<StoredCommandReceipt> { this.calls.push("confirmPlan"); return receipt; }
  async getWorkUnit(): Promise<StoredWorkUnit | undefined> { return this.unit; }
  async dispatchWorkUnit(): Promise<StoredCommandReceipt> { this.calls.push("dispatchWorkUnit"); return receipt; }
  async getRun(): Promise<StoredRun | undefined> { return this.run; }
  async submitCriticReview(input: { outcome: "PASS" | "REVISE" | "ESCALATE" }): Promise<StoredCommandReceipt> { this.calls.push("submitCriticReview"); this.criticInput = input; return { ...receipt, id: runId }; }
  async submitGuardianVerdict(): Promise<StoredCommandReceipt> { this.calls.push("submitGuardianVerdict"); return receipt; }
}

const allow: CommandAuthorizer = { async authorize() { return { outcome: "ALLOW" }; } };

describe("GovernedMyceliumCommandService", () => {
  it("maps Critic outcomes without allowing a PASS to become acceptance", () => {
    expect(workUnitStatusForCriticOutcome("PASS")).toBe("AWAITING_REVIEW");
    expect(workUnitStatusForCriticOutcome("REVISE")).toBe("REVISION_REQUIRED");
    expect(workUnitStatusForCriticOutcome("ESCALATE")).toBe("ESCALATED");
  });

  it("fails closed: a denied authority decision reaches no canonical write", async () => {
    const store = new Store();
    const denied: CommandAuthorizer = { async authorize() { return { outcome: "DENY", reason: "constitution prohibits this" }; } };
    const service = new GovernedMyceliumCommandService(denied, store);
    await expect(service.createIntent({ organisationId: org, requestedBy: human, text: "Acquire source checkout" })).rejects.toBeInstanceOf(CommandDeniedError);
    expect(store.calls).toEqual([]);
  });

  it("requires confirmation of the canonical plan before dispatch", async () => {
    const store = new Store();
    store.plan = { ...store.plan!, status: "PREVIEW" };
    const service = new GovernedMyceliumCommandService(allow, store);
    await expect(service.dispatchWorkUnit({ organisationId: org, workUnitId: unitId, workerId: worker, requestedBy: human })).rejects.toBeInstanceOf(CommandPreconditionError);
    expect(store.calls).toEqual([]);
  });

  it("does not permit ACCEPT without an exact reviewed run", async () => {
    const store = new Store();
    const service = new GovernedMyceliumCommandService(allow, store);
    await expect(service.submitGuardianVerdict({ organisationId: org, verdict: { workUnitId: unitId, outcome: "ACCEPT", decidedBy: human, rationale: "Evidence is sufficient", evidenceIds: [] } })).rejects.toThrow("exact run");
    expect(store.calls).toEqual([]);
  });

  it("records an independent PASS review and retains the work unit for Guardian review", async () => {
    const store = new Store();
    store.unit = { ...store.unit!, status: "AWAITING_REVIEW" };
    const critic = id("00000000-0000-4000-8000-000000000008");
    const service = new GovernedMyceliumCommandService(allow, store);
    const result = await service.submitCriticReview({ organisationId: org, review: { workUnitId: unitId, runId, criticWorkerId: critic, reviewedBy: { type: "AGENT", id: critic }, outcome: "PASS", rationale: "Output matches the contract" } });
    expect(store.calls).toEqual(["submitCriticReview"]);
    expect(store.criticInput?.outcome).toBe("PASS");
    expect(result.commandId).toBe(runId);
  });

  it("fails before storage when the executor attempts to review its own run", async () => {
    const store = new Store();
    store.unit = { ...store.unit!, status: "AWAITING_REVIEW" };
    const service = new GovernedMyceliumCommandService(allow, store);
    await expect(service.submitCriticReview({ organisationId: org, review: { workUnitId: unitId, runId, criticWorkerId: worker, reviewedBy: { type: "AGENT", id: worker }, outcome: "REVISE", rationale: "Independent review cannot be self-assigned" } })).rejects.toThrow("executor cannot review");
    expect(store.calls).toEqual([]);
  });

  it("fails closed when policy denies a Critic review", async () => {
    const store = new Store();
    store.unit = { ...store.unit!, status: "AWAITING_REVIEW" };
    const critic = id("00000000-0000-4000-8000-000000000008");
    const denied: CommandAuthorizer = { async authorize() { return { outcome: "REQUIRE_APPROVAL", reason: "reviewer authority required" }; } };
    const service = new GovernedMyceliumCommandService(denied, store);
    await expect(service.submitCriticReview({ organisationId: org, review: { workUnitId: unitId, runId, criticWorkerId: critic, reviewedBy: { type: "AGENT", id: critic }, outcome: "ESCALATE", rationale: "Needs a human decision" } })).rejects.toBeInstanceOf(CommandDeniedError);
    expect(store.calls).toEqual([]);
  });

  it("accepts an attributable Guardian verdict only after policy and lifecycle checks", async () => {
    const store = new Store();
    const service = new GovernedMyceliumCommandService(allow, store);
    const result = await service.submitGuardianVerdict({ organisationId: org, verdict: { workUnitId: unitId, runId, outcome: "ACCEPT", decidedBy: human, rationale: "Evidence is sufficient", evidenceIds: [id("00000000-0000-4000-8000-000000000007")] } });
    expect(store.calls).toEqual(["submitGuardianVerdict"]);
    expect(result).toEqual({ commandId: unitId, canonicalVersion: 2, acceptedAt: "2026-09-12T00:00:00.000Z" });
  });
});
