import type {
  ApprovalRequest,
  AuthorisedToolAction,
  AuthorityContext,
  BudgetState,
  Capability,
  DomainEvent,
  Money,
  OrganisationId,
  ToolActionId,
  ToolActionRequest,
  ToolActionResult,
  ToolConnection,
} from "@genesis/domain";
import type { ToolAuthorisationEnvelope } from "@genesis/mycelium-contracts";

/**
 * Tool Gateway ports (Build Bible §4, §51–§53).
 *
 * The gateway owns authorised side effects, but it does not own persistence,
 * credentials or policy. Each of those arrives through a narrow interface so
 * the gateway stays pure and independently testable.
 */

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(): string;
}

/** Metadata lookup for a capability, including its risk class. */
export interface CapabilityLookup {
  get(capabilityKey: string): Promise<Capability | undefined>;
}

/** Resolves the active connection that can serve a capability. */
export interface ConnectionLookup {
  findForCapability(
    organisationId: OrganisationId,
    capabilityKey: string,
  ): Promise<ToolConnection | undefined>;
}

/**
 * Loads every policy input the authority resolver needs from PostgreSQL.
 * The gateway never invents authority; it asks for it.
 */
export interface AuthorityContextProvider {
  load(request: ToolActionRequest): Promise<AuthorityContext>;
}

/** The persisted state of a tool action request (Build Bible §26). */
export interface StoredAction {
  id: ToolActionId;
  organisationId: OrganisationId;
  capabilityKey: string;
  idempotencyKey: string;
  payloadHash: string;
  state: string;
  connectionId?: string;
  approvalId?: string;
  budgetId?: string;
  reservedCost?: Money;
}

export interface ActionStatePatch {
  connectionId?: string;
  approvalId?: string;
  budgetId?: string;
  reservedCost?: Money;
}

export interface ActionStore {
  findByIdempotencyKey(
    organisationId: OrganisationId,
    idempotencyKey: string,
  ): Promise<StoredAction | undefined>;
  findById(actionId: ToolActionId): Promise<StoredAction | undefined>;
  create(record: StoredAction): Promise<void>;
  updateState(
    actionId: ToolActionId,
    state: string,
    patch?: ActionStatePatch,
  ): Promise<void>;
  recordResult(result: ToolActionResult): Promise<void>;
  getResult(actionId: ToolActionId): Promise<ToolActionResult | undefined>;
}

export interface CreateApprovalInput {
  organisationId: OrganisationId;
  actionRequestId: ToolActionId;
  requestedBy: ToolActionRequest["requestedBy"];
  riskClass: Capability["riskClass"];
  title: string;
  summary: string;
  payloadSnapshotId: string;
  expiresAt: string;
}

export interface ApprovalStore {
  create(input: CreateApprovalInput): Promise<ApprovalRequest>;
  get(approvalId: string): Promise<ApprovalRequest | undefined>;
  /**
   * True only when the approval is APPROVED and still bound to this exact
   * payload hash (SEC-005, INV-009).
   */
  isCurrent(approvalId: string, payloadHash: string): Promise<boolean>;
}

export interface BudgetStore {
  load(budgetId: string): Promise<BudgetState | undefined>;
  reserve(budgetId: string, cost: Money): Promise<void>;
  release(budgetId: string, reserved: Money): Promise<void>;
  settle(budgetId: string, reserved: Money, actual: Money): Promise<void>;
}

/** Emits domain events after a state transition (Foundation Spec 01 §33). */
export interface EventPublisher {
  publish(event: DomainEvent): Promise<void>;
}

/** Reconciliation support for UNKNOWN outcomes (Spec 03 §16, §89). */
export interface ReconciliationLookup {
  findByActionId(
    actionId: ToolActionId,
  ): Promise<AuthorisedToolAction | undefined>;
}

/**
 * Verifies that an envelope was issued by the canonical Mycelium authority.
 * Signature/key handling is deliberately outside the gateway: the gateway
 * receives only a verdict, never signing material.
 */
export interface ToolAuthorisationEnvelopeVerifier {
  verify(envelope: ToolAuthorisationEnvelope): Promise<EnvelopeVerification>;
}

export type EnvelopeVerification =
  | { valid: true }
  | { valid: false; code: string; message: string };

/** Atomic, durable nonce consumption. Returns false when already consumed. */
export interface ToolAuthorisationNonceStore {
  consume(nonce: string, expiresAt: string): Promise<boolean>;
}

/**
 * R3 actions require recorded Guardian approval tied to the exact canonical
 * work unit, run, capability and payload—not merely a donor approval.
 */
export interface GuardianApprovalEvidenceLookup {
  isCurrent(input: {
    organisationId: string;
    workUnitId: string;
    runId: string;
    capabilityKey: string;
    payloadHash: string;
  }): Promise<boolean>;
}
