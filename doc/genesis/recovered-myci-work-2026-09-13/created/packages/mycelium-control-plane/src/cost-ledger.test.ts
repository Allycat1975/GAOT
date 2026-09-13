import { describe, expect, it } from "vitest";
import type { CanonicalId, MyceliumActor } from "@genesis/mycelium-contracts";
import { TrustedCostLedgerRecorder, type CostLedgerStore, type CostObservation } from "./cost-ledger.js";

const id = (value: string) => value as CanonicalId;
const actor: MyceliumActor = { type: "SYSTEM", id: id("00000000-0000-4000-8000-000000000001") };
const sample = (): CostObservation => ({ organisationId: id("00000000-0000-4000-8000-000000000002"), workUnitId: id("00000000-0000-4000-8000-000000000003"), runId: id("00000000-0000-4000-8000-000000000004"), sourceKind: "MODEL_USAGE", sourceReference: "provider-request-123", idempotencyKey: "usage/provider-request-123", amountMinor: 17, currency: "USD", usage: { input_tokens: 100, output_tokens: 20 }, observedAt: new Date("2026-09-12T00:00:00.000Z"), recordedBy: actor });

class Store implements CostLedgerStore {
  received: CostObservation[] = [];
  async append(value: CostObservation) { this.received.push(value); return { id: id("00000000-0000-4000-8000-000000000005"), recordedAt: value.observedAt }; }
}

describe("TrustedCostLedgerRecorder", () => {
  it("accepts an attributable, actual provider observation without transforming usage", async () => {
    const store = new Store();
    await new TrustedCostLedgerRecorder(store).record(sample());
    expect(store.received).toHaveLength(1);
    expect(store.received[0]?.usage).toEqual({ input_tokens: 100, output_tokens: 20 });
  });
  it("rejects estimates, malformed currency, and missing durable attribution before storage", async () => {
    const store = new Store(); const recorder = new TrustedCostLedgerRecorder(store);
    await expect(recorder.record({ ...sample(), amountMinor: -1 })).rejects.toThrow("non-negative");
    await expect(recorder.record({ ...sample(), currency: "usd" })).rejects.toThrow("ISO-4217");
    await expect(recorder.record({ ...sample(), sourceReference: " " })).rejects.toThrow("source reference");
    expect(store.received).toHaveLength(0);
  });
});
