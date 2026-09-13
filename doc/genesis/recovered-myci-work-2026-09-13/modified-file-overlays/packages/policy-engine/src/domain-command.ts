import type {
  AuthorityDecision,
  DomainCommandPolicyRequest,
  PolicyRef,
} from "@genesis/domain";
import { policyRef } from "./precedence.js";

/**
 * Domain command evaluation (Build Bible §40, §79).
 *
 * Agents may propose internal state changes, but those commands execute
 * through application services under the same authority rules. Agent-generated
 * SQL is never permitted.
 */

/** Commands that mutate state and therefore require a granted authority flag. */
const COMMAND_AUTHORITY_FLAGS: Record<
  string,
  keyof DomainCommandPolicyRequest["context"]["roleVersion"]["authority"]
> = {
  CreateProject: "mayCreateProject",
  PauseProject: "mayPauseProject",
  CancelProject: "mayCancelProject",
  CreateTask: "mayCreateTask",
  AssignTask: "mayAssignTask",
  InstantiateAgent: "mayInstantiateAgent",
  RetireAgent: "mayRetireAgent",
  ChangeWorkflow: "mayChangeWorkflow",
  // Mycelium commands use the same canonical authority flags as their domain
  // equivalents. They are registered here so unknown commands still deny.
  CreateIntent: "mayCreateTask",
  ConfirmExecutionPlan: "mayChangeWorkflow",
  DispatchWorkUnit: "mayAssignTask",
};

/** A Guardian verdict is a consequential decision, never a generic note. */
const COMMAND_DECISION_CLASSES: Record<string, string> = {
  CriticReview: "critic_review",
  GuardianVerdict: "guardian_verdict",
};

/** Commands that are always internal and low-risk when the role is active. */
const INTERNAL_COMMANDS = new Set([
  "CreateOpportunity",
  "RecordDecision",
  "CreateMemory",
  "UpdateOpportunityStage",
  "CreateDocument",
]);

export function evaluateDomainCommand(
  request: DomainCommandPolicyRequest,
): AuthorityDecision {
  const { context } = request;
  const refs: PolicyRef[] = [
    policyRef("ROLE_VERSION", `command:${request.commandType}`),
  ];

  if (context.organisation.status === "PAUSED") {
    return deny(
      "ORGANISATION_PAUSED",
      "The organisation is paused; new domain mutations are blocked.",
      [policyRef("ORGANISATION_POLICY", "organisation.status", "PAUSED")],
    );
  }

  if (context.roleVersion.status !== "ACTIVE") {
    return deny(
      "ROLE_NOT_ACTIVE",
      "The role version is not active.",
      [policyRef("ROLE_VERSION", context.roleVersion.id)],
    );
  }

  if (INTERNAL_COMMANDS.has(request.commandType)) {
    return { outcome: "ALLOW", policyRefs: refs };
  }

  const decisionClass = COMMAND_DECISION_CLASSES[request.commandType];
  if (decisionClass !== undefined) {
    return evaluateDecisionClass(request, decisionClass, refs);
  }

  const flag = COMMAND_AUTHORITY_FLAGS[request.commandType];
  if (flag === undefined) {
    // Unknown commands are never silently allowed.
    return deny(
      "COMMAND_NOT_PERMITTED",
      `Command "${request.commandType}" is not a recognised domain command.`,
      refs,
    );
  }

  if (context.roleVersion.authority[flag] !== true) {
    return deny(
      "COMMAND_NOT_PERMITTED",
      `The role is not authorised to execute "${request.commandType}".`,
      refs,
    );
  }

  return { outcome: "ALLOW", policyRefs: refs };
}

function evaluateDecisionClass(
  request: DomainCommandPolicyRequest,
  decisionClass: string,
  refs: PolicyRef[],
): AuthorityDecision {
  const grant = request.context.roleVersion.authority.decisionClasses.find(
    (candidate) => candidate.decisionClass === decisionClass,
  );

  if (grant === undefined || grant.effect === "DENY") {
    return deny(
      "DECISION_CLASS_NOT_PERMITTED",
      `The role is not authorised to make a "${decisionClass}" decision.`,
      [...refs, policyRef("ROLE_VERSION", `decision:${decisionClass}`)],
    );
  }

  if (grant.effect === "APPROVAL_REQUIRED") {
    // DecisionAuthority identifies a decision but does not name an approver.
    // An approval-required decision without an ApprovalPolicy must fail shut.
    const approval = request.context.roleVersion.approvals.find(
      (policy) => policy.trigger.type === "DECISION_CLASS" && policy.trigger.decisionClass === decisionClass,
    );
    if (approval === undefined) {
      return deny(
        "DECISION_APPROVAL_POLICY_MISSING",
        `"${decisionClass}" requires approval but no approver policy is configured.`,
        [...refs, policyRef("ROLE_VERSION", `decision:${decisionClass}`)],
      );
    }
    const approver = approval.approver;
    const requiredApprovers = approver.type === "ROLE"
      ? [{ type: "ROLE" as const, roleKey: approver.roleKey, mode: approval.mode }]
      : approver.type === "HUMAN_OWNER"
        ? [{ type: "HUMAN_OWNER" as const, mode: approval.mode }]
        : [{ type: "SPECIFIC_ACTOR" as const, actorId: approver.actorId, mode: approval.mode }];
    return {
      outcome: "REQUIRE_APPROVAL",
      policyRefs: [...refs, policyRef("ROLE_VERSION", `approval:decision:${decisionClass}`)],
      requiredApprovers,
    };
  }

  return {
    outcome: "ALLOW",
    policyRefs: [...refs, policyRef("ROLE_VERSION", `decision:${decisionClass}`)],
  };
}

function deny(
  reasonCode: string,
  explanation: string,
  policyRefs: PolicyRef[],
): AuthorityDecision {
  return { outcome: "DENY", reasonCode, explanation, policyRefs };
}
