import type { Kysely } from "kysely";
import type { Database } from "@genesis/database";
import { roleVersionSpecSchema } from "@genesis/role-factory";
import type { ActorRef, AuthorityContext, OrganisationId, OrganisationStatus, RoleVersion, RoleVersionId } from "@genesis/domain";
import type { CanonicalId, MyceliumActor } from "@genesis/mycelium-contracts";
import type { GovernedCommandType } from "./ports.js";
import type { MyceliumAuthorityResolver } from "./policy-authorizer.js";

const canonical = (value: string): CanonicalId => value as CanonicalId;

/**
 * Supplies the non-role layers of AuthorityContext. It is deliberately a
 * port: a PostgreSQL role assignment must not invent constitution, project,
 * workflow, budget, or autonomy context just to reach an allow decision.
 */
export interface MyceliumPolicyContextSource {
  loadPolicyContext(input: {
    organisationId: CanonicalId;
    actor: MyceliumActor;
    roleVersion: RoleVersion;
    commandType: GovernedCommandType;
    payload: unknown;
  }): Promise<Omit<AuthorityContext, "organisation" | "roleVersion"> | undefined>;
}

export type RoleAssignmentRow = {
  assignment_organisation_id: string;
  role_organisation_id: string;
  assignment_status: "ACTIVE" | "REVOKED";
  effective_from: Date;
  effective_until: Date | null;
  role_id: string;
  role_spec_id: string;
  role_version: number;
  role_status: "DRAFT" | "ACTIVE" | "RETIRED";
  specification: unknown;
  supersedes_id: string | null;
  created_by_actor_type: string;
  created_by_actor_id: string | null;
  role_effective_from: Date | null;
  role_created_at: Date;
};

/**
 * PostgreSQL authority adapter used by PolicyEngineCommandAuthorizer.
 *
 * It only proves canonical facts; no org.memberships lookup appears here.
 * A missing, expired, revoked, cross-tenant, malformed, or inactive binding
 * returns undefined and therefore the command authorizer denies the command.
 */
export class PostgresMyceliumAuthorityResolver implements MyceliumAuthorityResolver {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly policyContextSource: MyceliumPolicyContextSource,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async loadOrganisation(organisationId: CanonicalId): Promise<{ id: CanonicalId; status: OrganisationStatus } | undefined> {
    const row = await this.db.selectFrom("org.organisations")
      .select(["id", "status"])
      .where("id", "=", organisationId)
      .executeTakeFirst();
    return row ? { id: canonical(row.id), status: row.status } : undefined;
  }

  async loadActorRole(input: { organisationId: CanonicalId; actor: MyceliumActor }): Promise<RoleVersion | undefined> {
    const now = this.now();
    const row = await this.db.selectFrom("mycelium.actor_role_assignments as assignment")
      .innerJoin("roles.role_versions as role", "role.id", "assignment.role_version_id")
      .select([
        "assignment.organisation_id as assignment_organisation_id",
        "role.organisation_id as role_organisation_id",
        "assignment.status as assignment_status",
        "assignment.effective_from",
        "assignment.effective_until",
        "role.id as role_id",
        "role.role_spec_id",
        "role.role_version",
        "role.status as role_status",
        "role.specification",
        "role.supersedes_id",
        "role.created_by_actor_type",
        "role.created_by_actor_id",
        "role.effective_from as role_effective_from",
        "role.created_at as role_created_at",
      ])
      .where("assignment.organisation_id", "=", input.organisationId)
      .where("role.organisation_id", "=", input.organisationId)
      .where("assignment.actor_type", "=", input.actor.type)
      .where("assignment.actor_id", "=", input.actor.id)
      .where("assignment.status", "=", "ACTIVE")
      .where("role.status", "=", "ACTIVE")
      .where("assignment.effective_from", "<=", now)
      .where((eb) => eb.or([eb("assignment.effective_until", "is", null), eb("assignment.effective_until", ">", now)]))
      .executeTakeFirst() as RoleAssignmentRow | undefined;
    if (!row || !isActiveAt(row, input.organisationId, now)) return undefined;

    if (!(await this.isActiveCanonicalPrincipal(input))) return undefined;
    return toRoleVersion(row, input.organisationId);
  }

  loadPolicyContext(input: { organisationId: CanonicalId; actor: MyceliumActor; roleVersion: RoleVersion; commandType: GovernedCommandType; payload: unknown }): Promise<Omit<AuthorityContext, "organisation" | "roleVersion"> | undefined> {
    return this.policyContextSource.loadPolicyContext(input);
  }

  async loadRunExecutor(input: { organisationId: CanonicalId; runId: CanonicalId }): Promise<MyceliumActor | undefined> {
    const run = await this.db.selectFrom("mycelium.runs")
      .select("worker_id")
      .where("organisation_id", "=", input.organisationId)
      .where("id", "=", input.runId)
      .executeTakeFirst();
    return run ? { type: "AGENT", id: canonical(run.worker_id) } : undefined;
  }

  private async isActiveCanonicalPrincipal(input: { organisationId: CanonicalId; actor: MyceliumActor }): Promise<boolean> {
    if (input.actor.type === "SYSTEM") return true;
    if (input.actor.type === "HUMAN") {
      const user = await this.db.selectFrom("identity.users").select("id")
        .where("id", "=", input.actor.id).where("status", "=", "ACTIVE").executeTakeFirst();
      return user !== undefined;
    }
    const agent = await this.db.selectFrom("agents.instances").select("id")
      .where("id", "=", input.actor.id)
      .where("organisation_id", "=", input.organisationId)
      .where("status", "!=", "RETIRED")
      .executeTakeFirst();
    return agent !== undefined;
  }
}

export function isActiveAt(row: RoleAssignmentRow, organisationId: CanonicalId, now: Date): boolean {
  return row.assignment_organisation_id === organisationId
    && row.role_organisation_id === organisationId
    && row.assignment_status === "ACTIVE"
    && row.role_status === "ACTIVE"
    && row.effective_from <= now
    && (row.effective_until === null || row.effective_until > now);
}

/** Exported for focused adapter tests and to make invalid persisted specs fail closed. */
export function toRoleVersion(row: RoleAssignmentRow, organisationId: CanonicalId): RoleVersion | undefined {
  if (row.role_status !== "ACTIVE") return undefined;
  const parsed = roleVersionSpecSchema.safeParse(row.specification);
  if (!parsed.success) return undefined;
  const { schemaVersion: _schemaVersion, ...specification } = parsed.data;
  if (row.created_by_actor_id === null || !isActorType(row.created_by_actor_type)) return undefined;
  return {
    ...specification,
    id: row.role_id as RoleVersionId,
    roleSpecId: row.role_spec_id,
    organisationId: organisationId as unknown as OrganisationId,
    version: row.role_version,
    status: "ACTIVE",
    effectiveFrom: row.role_effective_from?.toISOString(),
    supersedesVersionId: row.supersedes_id === null ? undefined : row.supersedes_id as RoleVersionId,
    createdAt: row.role_created_at.toISOString(),
    createdBy: { type: row.created_by_actor_type, id: row.created_by_actor_id } as ActorRef,
  };
}

function isActorType(value: string): value is MyceliumActor["type"] {
  return value === "HUMAN" || value === "AGENT" || value === "SYSTEM";
}
