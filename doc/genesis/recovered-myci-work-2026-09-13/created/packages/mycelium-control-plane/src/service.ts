import type { CommandReceipt, ConfirmPlanCommand, CreateIntentCommand, DispatchWorkUnitCommand, MyceliumCommandPort, SubmitCriticReviewCommand, SubmitGuardianVerdictCommand } from "@genesis/mycelium-contracts";
import type { CommandAuthorizer, GovernedCommandType, MyceliumCommandStore } from "./ports.js";

export class CommandDeniedError extends Error {
  constructor(readonly commandType: GovernedCommandType, readonly reason: string) { super(`Mycelium command denied: ${commandType}: ${reason}`); }
}
export class CommandPreconditionError extends Error {}

export class GovernedMyceliumCommandService implements MyceliumCommandPort {
  constructor(private readonly authorizer: CommandAuthorizer, private readonly store: MyceliumCommandStore) {}

  async createIntent(command: CreateIntentCommand): Promise<CommandReceipt> {
    this.requireText(command.text, "intent text");
    await this.authorize("mycelium.intent.create", command.organisationId, command.requestedBy, command);
    return this.receipt(await this.store.createIntent({ organisationId: command.organisationId, actor: command.requestedBy, text: command.text.trim() }));
  }

  async confirmPlan(command: ConfirmPlanCommand): Promise<CommandReceipt> {
    await this.authorize("mycelium.plan.confirm", command.organisationId, command.confirmedBy, command);
    const plan = await this.store.getPlan(command.organisationId, command.planId);
    if (!plan) throw new CommandPreconditionError("execution plan does not belong to this organisation");
    if (plan.status !== "PREVIEW") throw new CommandPreconditionError(`only PREVIEW plans may be confirmed; plan is ${plan.status}`);
    return this.receipt(await this.store.confirmPlan({ organisationId: command.organisationId, planId: command.planId, actor: command.confirmedBy }));
  }

  async dispatchWorkUnit(command: DispatchWorkUnitCommand): Promise<CommandReceipt> {
    await this.authorize("mycelium.work-unit.dispatch", command.organisationId, command.requestedBy, command);
    const unit = await this.store.getWorkUnit(command.organisationId, command.workUnitId);
    if (!unit) throw new CommandPreconditionError("work unit does not belong to this organisation");
    if (unit.status !== "DRAFT" && unit.status !== "REVISION_REQUIRED") throw new CommandPreconditionError(`only DRAFT or REVISION_REQUIRED work may be dispatched; work unit is ${unit.status}`);
    const plan = await this.store.getPlan(command.organisationId, unit.planId);
    if (!plan || plan.status !== "CONFIRMED") throw new CommandPreconditionError("work unit cannot dispatch before its plan is CONFIRMED");
    return this.receipt(await this.store.dispatchWorkUnit({ organisationId: command.organisationId, workUnitId: command.workUnitId, workerId: command.workerId, actor: command.requestedBy }));
  }

  async submitCriticReview(command: SubmitCriticReviewCommand): Promise<CommandReceipt> {
    const { review } = command;
    this.requireText(review.rationale, "Critic rationale");
    // A caller may not name an unrelated worker as the critic. This makes the
    // policy decision, audit event, and database review attributable to one actor.
    if (review.reviewedBy.type !== "AGENT" || review.reviewedBy.id !== review.criticWorkerId) {
      throw new CommandPreconditionError("a Critic review must be submitted by its attributable AGENT worker");
    }
    await this.authorize("mycelium.critic.review", command.organisationId, review.reviewedBy, command);
    const unit = await this.store.getWorkUnit(command.organisationId, review.workUnitId);
    if (!unit) throw new CommandPreconditionError("work unit does not belong to this organisation");
    if (unit.status !== "AWAITING_REVIEW") throw new CommandPreconditionError(`only AWAITING_REVIEW work may receive a Critic review; work unit is ${unit.status}`);
    const run = await this.store.getRun(command.organisationId, review.runId);
    if (!run || run.workUnitId !== review.workUnitId) throw new CommandPreconditionError("Critic review run must belong to the reviewed work unit");
    if (run.status !== "SUCCEEDED") throw new CommandPreconditionError(`only a SUCCEEDED run may receive a Critic review; run is ${run.status}`);
    if (run.workerId === review.criticWorkerId) throw new CommandPreconditionError("executor cannot review its own run");
    return this.receipt(await this.store.submitCriticReview({ organisationId: command.organisationId, workUnitId: review.workUnitId, runId: review.runId, criticWorkerId: review.criticWorkerId, actor: review.reviewedBy, outcome: review.outcome, rationale: review.rationale.trim() }));
  }

  async submitGuardianVerdict(command: SubmitGuardianVerdictCommand): Promise<CommandReceipt> {
    const { verdict } = command;
    this.requireText(verdict.rationale, "Guardian rationale");
    if (verdict.outcome === "ACCEPT" && !verdict.runId) throw new CommandPreconditionError("Guardian acceptance requires an exact run");
    await this.authorize("mycelium.guardian.verdict", command.organisationId, verdict.decidedBy, command);
    const unit = await this.store.getWorkUnit(command.organisationId, verdict.workUnitId);
    if (!unit) throw new CommandPreconditionError("work unit does not belong to this organisation");
    if (verdict.runId) {
      const run = await this.store.getRun(command.organisationId, verdict.runId);
      if (!run || run.workUnitId !== verdict.workUnitId) throw new CommandPreconditionError("Guardian verdict run must belong to the reviewed work unit");
    }
    return this.receipt(await this.store.submitGuardianVerdict({ organisationId: command.organisationId, workUnitId: verdict.workUnitId, ...(verdict.runId ? { runId: verdict.runId } : {}), actor: verdict.decidedBy, outcome: verdict.outcome, rationale: verdict.rationale.trim(), evidenceIds: verdict.evidenceIds }));
  }

  private async authorize(commandType: GovernedCommandType, organisationId: CreateIntentCommand["organisationId"], actor: CreateIntentCommand["requestedBy"], payload: unknown): Promise<void> {
    const decision = await this.authorizer.authorize({ commandType, organisationId, actor, payload });
    if (decision.outcome !== "ALLOW") throw new CommandDeniedError(commandType, decision.reason);
  }
  private receipt(value: { id: CommandReceipt["commandId"]; version: number; acceptedAt: Date }): CommandReceipt { return { commandId: value.id, canonicalVersion: value.version, acceptedAt: value.acceptedAt.toISOString() }; }
  private requireText(value: string, label: string): void { if (!value.trim()) throw new CommandPreconditionError(`${label} is required`); }
}
