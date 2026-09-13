import { DefaultPolicyEngine } from "@genesis/policy-engine";
import type {
  AuthorityContext,
  OrganisationId,
  OrganisationStatus,
  PolicyEngine,
  RoleVersion,
} from "@genesis/domain";
import type { CanonicalId, MyceliumActor } from "@genesis/mycelium-contracts";
import type { CommandAuthorizer, GovernedCommandType } from "./ports.js";

/**
 * The policy engine evaluates pure, complete contexts. This resolver boundary
 * is intentionally narrow: persistence may establish a caller's role, but it
 * may not make a policy decision on the application's behalf.
 */
export interface MyceliumAuthorityResolver {
  loadOrganisation(organisationId: CanonicalId): Promise<{
    id: CanonicalId;
    status: OrganisationStatus;
  } | undefined>;

  /**
   * Proves the active role assignment for this exact actor and organisation.
   * A membership label or a raw actor id is not sufficient authority.
   */
  loadActorRole(input: {
    organisationId: CanonicalId;
    actor: MyceliumActor;
  }): Promise<RoleVersion | undefined>;

  /** Supplies any narrower project/workflow/budget policy that applies. */
  loadPolicyContext(input: {
    organisationId: CanonicalId;
    actor: MyceliumActor;
    roleVersion: RoleVersion;
    commandType: GovernedCommandType;
    payload: unknown;
  }): Promise<Omit<AuthorityContext, "organisation" | "roleVersion"> | undefined>;

  /**
   * Preflight Guardian independence against the exact reviewed run. The
   * database trigger remains the final enforcement point.
   */
  loadRunExecutor(input: {
    organisationId: CanonicalId;
    runId: CanonicalId;
  }): Promise<MyceliumActor | undefined>;
}

/**
 * Explicit mapping from Mycelium application commands to canonical policy
 * semantics. These strings are registered in policy-engine/domain-command;
 * this adapter must never evaluate an ad-hoc command name.
 */
export const MYCELIUM_COMMAND_POLICY_SEMANTICS: Record<
  GovernedCommandType,
  "CreateIntent" | "ConfirmExecutionPlan" | "DispatchWorkUnit" | "CriticReview" | "GuardianVerdict"
> = {
  "mycelium.intent.create": "CreateIntent",
  "mycelium.plan.confirm": "ConfirmExecutionPlan",
  "mycelium.work-unit.dispatch": "DispatchWorkUnit",
  "mycelium.critic.review": "CriticReview",
  "mycelium.guardian.verdict": "GuardianVerdict",
};

/**
 * Production composition of Mycelium command authorisation. Absence,
 * ownership mismatch, unknown policy semantics, and approval requirements all
 * deny the write; this object never becomes an implicit allow-list.
 */
export class PolicyEngineCommandAuthorizer implements CommandAuthorizer {
  constructor(
    private readonly resolver: MyceliumAuthorityResolver,
    private readonly policyEngine: PolicyEngine = new DefaultPolicyEngine(),
  ) {}

  async authorize(request: {
    commandType: GovernedCommandType;
    organisationId: CanonicalId;
    actor: MyceliumActor;
    payload: unknown;
  }): Promise<{ outcome: "ALLOW" } | { outcome: "DENY"; reason: string } | { outcome: "REQUIRE_APPROVAL"; reason: string }> {
    const semantic = MYCELIUM_COMMAND_POLICY_SEMANTICS[request.commandType];
    if (semantic === undefined) return { outcome: "DENY", reason: "unrecognised Mycelium command semantics" };

    const organisation = await this.resolver.loadOrganisation(request.organisationId);
    if (!organisation || organisation.id !== request.organisationId) {
      return { outcome: "DENY", reason: "organisation context is missing or mismatched" };
    }

    const roleVersion = await this.resolver.loadActorRole({ organisationId: request.organisationId, actor: request.actor });
    if (!roleVersion || roleVersion.organisationId !== (request.organisationId as unknown as OrganisationId)) {
      return { outcome: "DENY", reason: "actor has no proven role authority in this organisation" };
    }

    const supplement = await this.resolver.loadPolicyContext({
      organisationId: request.organisationId,
      actor: request.actor,
      roleVersion,
      commandType: request.commandType,
      payload: request.payload,
    });
    if (!supplement) return { outcome: "DENY", reason: "applicable policy context is unavailable" };

    const independence = await this.guardianIndependence(request);
    if (independence !== undefined) return independence;

    const decision = await this.policyEngine.evaluateDomainCommand({
      organisationId: request.organisationId as unknown as OrganisationId,
      actor: request.actor as never,
      commandType: semantic,
      payload: request.payload,
      context: {
        ...supplement,
        organisation: { id: organisation.id as unknown as OrganisationId, status: organisation.status },
        roleVersion,
      },
    });
    if (decision.outcome === "ALLOW") return { outcome: "ALLOW" };
    if (decision.outcome === "REQUIRE_APPROVAL") {
      return { outcome: "REQUIRE_APPROVAL", reason: "policy requires recorded approval before this command" };
    }
    return { outcome: "DENY", reason: `${decision.reasonCode}: ${decision.explanation}` };
  }

  private async guardianIndependence(request: {
    commandType: GovernedCommandType;
    organisationId: CanonicalId;
    actor: MyceliumActor;
    payload: unknown;
  }): Promise<{ outcome: "DENY"; reason: string } | undefined> {
    if (request.commandType !== "mycelium.guardian.verdict") return undefined;
    const runId = guardianRunId(request.payload);
    if (runId === undefined) return undefined;
    const executor = await this.resolver.loadRunExecutor({ organisationId: request.organisationId, runId });
    if (!executor) return { outcome: "DENY", reason: "reviewed run is missing or outside this organisation" };
    if (executor.type === request.actor.type && executor.id === request.actor.id) {
      return { outcome: "DENY", reason: "Guardian cannot review its own execution" };
    }
    return undefined;
  }
}

function guardianRunId(payload: unknown): CanonicalId | undefined {
  if (typeof payload !== "object" || payload === null || !("verdict" in payload)) return undefined;
  const verdict = (payload as { verdict?: unknown }).verdict;
  if (typeof verdict !== "object" || verdict === null || !("runId" in verdict)) return undefined;
  const runId = (verdict as { runId?: unknown }).runId;
  return typeof runId === "string" && runId.length > 0 ? runId as CanonicalId : undefined;
}
