import { describe, expect, it } from "vitest";
import { croRoleVersion, ORG_ID } from "@genesis/test-kit";
import type { AuthorityContext, RoleVersion } from "@genesis/domain";
import type { CanonicalId, MyceliumActor } from "@genesis/mycelium-contracts";
import { PolicyEngineCommandAuthorizer, type MyceliumAuthorityResolver } from "./policy-authorizer.js";

const id = (value: string) => value as CanonicalId;
const organisationId = ORG_ID as unknown as CanonicalId;
const agent: MyceliumActor = { type: "AGENT", id: id("33333333-3333-3333-3333-333333333333") };
const runId = id("00000000-0000-4000-8000-000000000010");

function resolver(overrides: Partial<MyceliumAuthorityResolver> = {}): MyceliumAuthorityResolver {
  const baseRole = croRoleVersion();
  const role = {
    ...baseRole,
    authority: {
      ...baseRole.authority,
      decisionClasses: [{ decisionClass: "guardian_verdict", effect: "ALLOW" }],
    },
  } as RoleVersion;
  const context: Omit<AuthorityContext, "organisation" | "roleVersion"> = { autonomyLevel: "AUTONOMOUS" };
  return {
    async loadOrganisation(idValue) { return { id: idValue, status: "ACTIVE" }; },
    async loadActorRole() { return role; },
    async loadPolicyContext() { return context; },
    async loadRunExecutor() { return { type: "AGENT", id: id("00000000-0000-4000-8000-000000000099") }; },
    ...overrides,
  };
}

describe("PolicyEngineCommandAuthorizer", () => {
  it("fails closed when a resolver cannot prove the actor's role", async () => {
    const authorizer = new PolicyEngineCommandAuthorizer(resolver({ async loadActorRole() { return undefined; } }));
    await expect(authorizer.authorize({ commandType: "mycelium.intent.create", organisationId, actor: agent, payload: { text: "Canonical only" } })).resolves.toEqual({ outcome: "DENY", reason: "actor has no proven role authority in this organisation" });
  });

  it("denies policy that does not grant the mapped semantic", async () => {
    const baseRole = croRoleVersion();
    const role = { ...baseRole, authority: { ...baseRole.authority, mayCreateTask: false } } as RoleVersion;
    const authorizer = new PolicyEngineCommandAuthorizer(resolver({ async loadActorRole() { return role; } }));
    const result = await authorizer.authorize({ commandType: "mycelium.intent.create", organisationId, actor: agent, payload: { text: "Canonical only" } });
    expect(result.outcome).toBe("DENY");
  });

  it("allows a command only after complete context and a recognised grant", async () => {
    const authorizer = new PolicyEngineCommandAuthorizer(resolver());
    await expect(authorizer.authorize({ commandType: "mycelium.intent.create", organisationId, actor: agent, payload: { text: "Canonical only" } })).resolves.toEqual({ outcome: "ALLOW" });
  });

  it("preserves Guardian independence before a canonical verdict write", async () => {
    const authorizer = new PolicyEngineCommandAuthorizer(resolver({ async loadRunExecutor() { return agent; } }));
    await expect(authorizer.authorize({
      commandType: "mycelium.guardian.verdict",
      organisationId,
      actor: agent,
      payload: { verdict: { runId } },
    })).resolves.toEqual({ outcome: "DENY", reason: "Guardian cannot review its own execution" });
  });
});
