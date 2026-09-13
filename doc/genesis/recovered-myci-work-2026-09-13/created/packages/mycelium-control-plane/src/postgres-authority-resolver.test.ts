import { describe, expect, it, vi } from "vitest";
import { croRoleVersion, ORG_ID } from "@genesis/test-kit";
import type { Kysely } from "kysely";
import type { Database } from "@genesis/database";
import type { CanonicalId, MyceliumActor } from "@genesis/mycelium-contracts";
import { PostgresMyceliumAuthorityResolver, isActiveAt, toRoleVersion, type RoleAssignmentRow } from "./postgres-authority-resolver.js";

const id = (value: string) => value as CanonicalId;
const organisationId = ORG_ID as unknown as CanonicalId;
const system: MyceliumActor = { type: "SYSTEM", id: id("33333333-3333-3333-3333-333333333333") };
const now = new Date("2026-09-12T12:00:00.000Z");

function roleSpec() {
  const role = croRoleVersion();
  const { id: _id, roleSpecId: _roleSpecId, organisationId: _organisationId, version: _version, status: _status, effectiveFrom: _effectiveFrom, supersedesVersionId: _supersedesVersionId, createdAt: _createdAt, createdBy: _createdBy, ...specification } = role;
  return { schemaVersion: "1.0", ...specification };
}

function row(overrides: Partial<RoleAssignmentRow> = {}): RoleAssignmentRow {
  return {
    assignment_organisation_id: organisationId,
    role_organisation_id: organisationId,
    assignment_status: "ACTIVE" as const,
    effective_from: new Date("2026-09-11T12:00:00.000Z"),
    effective_until: null,
    role_id: "44444444-4444-4444-4444-444444444444",
    role_spec_id: "role-spec-cro",
    role_version: 1,
    role_status: "ACTIVE" as const,
    specification: roleSpec(),
    supersedes_id: null,
    created_by_actor_type: "SYSTEM" as const,
    created_by_actor_id: "55555555-5555-5555-5555-555555555555",
    role_effective_from: new Date("2026-09-10T12:00:00.000Z"),
    role_created_at: new Date("2026-09-10T12:00:00.000Z"),
    ...overrides,
  };
}

/** Small fluent Kysely double: SYSTEM avoids a separate identity lookup. */
function dbReturning(...rows: unknown[]): Kysely<Database> {
  const query = {
    innerJoin: () => query,
    select: () => query,
    where: () => query,
    executeTakeFirst: vi.fn(async () => rows.shift()),
  };
  return { selectFrom: vi.fn(() => query) } as unknown as Kysely<Database>;
}

const noPolicyContext = { async loadPolicyContext() { return undefined; } };

describe("PostgresMyceliumAuthorityResolver", () => {
  it("denies an absent explicit assignment", async () => {
    const resolver = new PostgresMyceliumAuthorityResolver(dbReturning(undefined), noPolicyContext, () => now);
    await expect(resolver.loadActorRole({ organisationId, actor: system })).resolves.toBeUndefined();
  });

  it("denies revoked, expired, cross-tenant, and inactive-role bindings even if a query returns one", async () => {
    for (const invalid of [
      row({ assignment_status: "REVOKED" }),
      row({ effective_until: new Date("2026-09-11T11:59:59.000Z") }),
      row({ assignment_organisation_id: id("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa") }),
      row({ role_organisation_id: id("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa") }),
      row({ role_status: "RETIRED" }),
    ]) {
      const resolver = new PostgresMyceliumAuthorityResolver(dbReturning(invalid), noPolicyContext, () => now);
      await expect(resolver.loadActorRole({ organisationId, actor: system })).resolves.toBeUndefined();
    }
  });

  it("hydrates only a validated active RoleVersion specification", () => {
    expect(toRoleVersion(row(), organisationId)?.organisationId).toBe(organisationId);
    expect(toRoleVersion(row({ specification: { schemaVersion: "1.0" } }), organisationId)).toBeUndefined();
    expect(isActiveAt(row(), organisationId, now)).toBe(true);
  });
});
