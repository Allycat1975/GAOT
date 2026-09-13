import type { ColumnType, Generated } from "kysely";

/**
 * Kysely database interface typed to all tables (Build Bible §7–§112).
 *
 * This is the single source of truth for the database shape. It mirrors the
 * authoritative SQL migrations under /migrations.
 */

type TenantScoped = {
  organisation_id: string;
};

// ---------------------------------------------------------------------------
// identity schema
// ---------------------------------------------------------------------------

export interface UsersTable {
  id: Generated<string>;
  auth_subject: string;
  email: string;
  display_name: string | null;
  status: "ACTIVE" | "DISABLED";
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  version: Generated<number>;
}

// ---------------------------------------------------------------------------
// org schema
// ---------------------------------------------------------------------------

export interface OrganisationsTable {
  id: Generated<string>;
  name: string;
  slug: string;
  status: "ACTIVE" | "PAUSED" | "SUSPENDED" | "ARCHIVED";
  default_autonomy_level: "GUIDED" | "ASSISTED" | "AUTONOMOUS";
  active_constitution_version_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  version: Generated<number>;
}

export interface MembershipsTable extends TenantScoped {
  id: Generated<string>;
  user_id: string;
  role: "OWNER" | "ADMIN" | "EXECUTIVE" | "MEMBER" | "OBSERVER" | "DEVELOPER";
  status: "ACTIVE" | "INVITED" | "DISABLED";
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  version: Generated<number>;
}

export interface DepartmentsTable extends TenantScoped {
  id: Generated<string>;
  parent_department_id: string | null;
  code: string;
  name: string;
  purpose: string | null;
  status: "ACTIVE" | "INACTIVE";
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  version: Generated<number>;
}

// ---------------------------------------------------------------------------
// governance schema
// ---------------------------------------------------------------------------

export interface ConstitutionsTable extends TenantScoped {
  id: Generated<string>;
  version: number;
  status: "DRAFT" | "ACTIVE" | "RETIRED";
  purpose: string;
  document: unknown;
  document_hash: string;
  supersedes_id: string | null;
  created_by_actor_type: string;
  created_by_actor_id: string | null;
  effective_from: Date | null;
  created_at: Generated<Date>;
}

// ---------------------------------------------------------------------------
// roles schema
// ---------------------------------------------------------------------------

export interface RoleSpecsTable extends TenantScoped {
  id: Generated<string>;
  role_key: string;
  display_name: string;
  category: "EXECUTIVE" | "MANAGER" | "SPECIALIST" | "REVIEWER" | "SERVICE";
  description: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  version: Generated<number>;
}

export interface RoleVersionsTable extends TenantScoped {
  id: Generated<string>;
  role_spec_id: string;
  role_version: number;
  status: "DRAFT" | "ACTIVE" | "RETIRED";
  specification: unknown;
  schema_version: string;
  specification_hash: string;
  supersedes_id: string | null;
  created_by_actor_type: string;
  created_by_actor_id: string | null;
  effective_from: Date | null;
  created_at: Generated<Date>;
}

// ---------------------------------------------------------------------------
// work schema
// ---------------------------------------------------------------------------

export interface ProjectsTable extends TenantScoped {
  id: Generated<string>;
  code: string;
  name: string;
  objective: string;
  description: string | null;
  executive_sponsor_agent_id: string | null;
  lead_agent_id: string | null;
  status: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
  risk_level: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  budget_id: string | null;
  start_at: Date | null;
  target_at: Date | null;
  success_criteria: unknown;
  created_by_actor_type: string;
  created_by_actor_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  version: Generated<number>;
}

export interface GoalsTable extends TenantScoped {
  id: Generated<string>;
  project_id: string | null;
  parent_goal_id: string | null;
  scope: "ORGANISATION" | "DEPARTMENT" | "PROJECT" | "TEAM";
  title: string;
  description: string;
  status: string;
  owner_actor_type: string;
  owner_actor_id: string;
  success_measures: unknown;
  target_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface MilestonesTable extends TenantScoped {
  id: Generated<string>;
  project_id: string;
  goal_id: string | null;
  title: string;
  status: string;
  target_at: Date | null;
  completed_at: Date | null;
}

export interface TasksTable extends TenantScoped {
  id: Generated<string>;
  project_id: string | null;
  goal_id: string | null;
  milestone_id: string | null;
  parent_task_id: string | null;
  title: string;
  description: string;
  requested_by_actor_type: string;
  requested_by_actor_id: string;
  assigned_to_actor_type: string | null;
  assigned_to_actor_id: string | null;
  status: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
  risk_level: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  expected_output: unknown;
  output_artifact_id: string | null;
  due_at: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  failure_reason: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  version: Generated<number>;
}

export interface TaskDependenciesTable {
  predecessor_task_id: string;
  successor_task_id: string;
  dependency_type: "BLOCKS" | "REQUIRES_OUTPUT" | "REQUIRES_APPROVAL";
}

export interface WorkflowDefinitionsTable extends TenantScoped {
  id: Generated<string>;
  name: string;
  version: number;
  input_schema_ref: string;
  output_schema_ref: string | null;
  status: "DRAFT" | "ACTIVE" | "RETIRED";
  steps: unknown;
  created_at: Generated<Date>;
}

export interface WorkflowRunsTable extends TenantScoped {
  id: Generated<string>;
  workflow_definition_id: string;
  workflow_version: number;
  project_id: string | null;
  task_id: string | null;
  status: string;
  temporal_workflow_id: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Generated<Date>;
}

// ---------------------------------------------------------------------------
// agents schema
// ---------------------------------------------------------------------------

export interface AgentInstancesTable extends TenantScoped {
  id: Generated<string>;
  role_version_id: string;
  display_name: string;
  manager_agent_id: string | null;
  department_id: string | null;
  project_id: string | null;
  employment_type: "PERMANENT" | "PROJECT" | "TEMPORARY";
  status: string;
  autonomy_level: "GUIDED" | "ASSISTED" | "AUTONOMOUS";
  runtime_profile_key: string;
  current_task_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  retired_at: Date | null;
  version: Generated<number>;
}

export interface AgentRunsTable extends TenantScoped {
  id: Generated<string>;
  agent_instance_id: string;
  role_version_id: string;
  project_id: string | null;
  task_id: string | null;
  workflow_run_id: string | null;
  runtime_provider: string;
  runtime_model: string;
  status: string;
  context_snapshot_id: string;
  input_artifact_id: string | null;
  output_artifact_id: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  failure_code: string | null;
  created_at: Generated<Date>;
}

// ---------------------------------------------------------------------------
// tools schema
// ---------------------------------------------------------------------------

export interface CapabilitiesTable {
  id: Generated<string>;
  key: string;
  name: string;
  description: string;
  category: string;
  risk_class: "R0" | "R1" | "R2" | "R3";
  input_schema_ref: string;
  output_schema_ref: string;
  enabled: boolean;
}

export interface ToolConnectionsTable extends TenantScoped {
  id: Generated<string>;
  provider: string;
  display_name: string;
  supported_capability_keys: string[];
  credential_reference: string;
  status: "ACTIVE" | "EXPIRED" | "REVOKED" | "ERROR";
  created_at: Generated<Date>;
}

export interface ToolActionsTable extends TenantScoped {
  id: Generated<string>;
  requested_by_actor_type: string;
  requested_by_actor_id: string;
  agent_run_id: string | null;
  task_id: string | null;
  project_id: string | null;
  capability_key: string;
  input: unknown;
  reason: string;
  authority_manifest_hash: string | null;
  idempotency_key: string;
  status: string;
  connection_id: string | null;
  output: unknown;
  external_reference: string | null;
  error: unknown;
  requested_at: Generated<Date>;
  started_at: Date | null;
  completed_at: Date | null;
}

export interface ApprovalRequestsTable extends TenantScoped {
  id: Generated<string>;
  action_request_id: string;
  requested_by_actor_type: string;
  requested_by_actor_id: string;
  required_approver_type: string;
  required_approver_id: string | null;
  risk_class: "R0" | "R1" | "R2" | "R3";
  title: string;
  summary: string;
  consequence: string | null;
  payload_snapshot_id: string;
  status: string;
  expires_at: Date | null;
  resolved_by_actor_type: string | null;
  resolved_by_actor_id: string | null;
  resolved_at: Date | null;
  rejection_reason: string | null;
  created_at: Generated<Date>;
}

// ---------------------------------------------------------------------------
// memory schema
// ---------------------------------------------------------------------------

export interface MemoryRecordsTable extends TenantScoped {
  id: Generated<string>;
  project_id: string | null;
  type: string;
  title: string | null;
  content: string;
  embedding: ColumnType<number[] | null, number[] | null, number[] | null>;
  source_ref: unknown;
  confidence: number | null;
  sensitivity: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";
  valid_from: Date | null;
  valid_until: Date | null;
  created_by_actor_type: string;
  created_by_actor_id: string;
  created_at: Generated<Date>;
}

export interface DocumentsTable extends TenantScoped {
  id: Generated<string>;
  project_id: string | null;
  title: string;
  classification: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";
  current_version_id: string;
  created_by_actor_type: string;
  created_by_actor_id: string;
  created_at: Generated<Date>;
}

export interface DocumentVersionsTable extends TenantScoped {
  id: Generated<string>;
  document_id: string;
  version: number;
  object_storage_key: string;
  content_hash: string;
  mime_type: string;
  file_size: number;
  extracted_text_key: string | null;
  created_by_actor_type: string;
  created_by_actor_id: string;
  created_at: Generated<Date>;
}

// ---------------------------------------------------------------------------
// relationships schema
// ---------------------------------------------------------------------------

export interface ExternalOrganisationsTable extends TenantScoped {
  id: Generated<string>;
  legal_name: string;
  trading_name: string | null;
  website: string | null;
  category: string | null;
  created_at: Generated<Date>;
}

export interface ContactsTable extends TenantScoped {
  id: Generated<string>;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  external_organisation_id: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface InteractionsTable extends TenantScoped {
  id: Generated<string>;
  project_id: string | null;
  contact_id: string | null;
  external_organisation_id: string | null;
  type: string;
  direction: "INBOUND" | "OUTBOUND" | "INTERNAL";
  occurred_at: Date;
  summary: string;
  actor_type: string;
  actor_id: string;
  source_artifact_id: string | null;
}

// ---------------------------------------------------------------------------
// finance schema
// ---------------------------------------------------------------------------

export interface BudgetsTable extends TenantScoped {
  id: Generated<string>;
  scope: "ORGANISATION" | "DEPARTMENT" | "PROJECT" | "AGENT";
  scope_id: string;
  currency: string;
  hard_limit: number;
  soft_limit: number | null;
  period: "TASK" | "DAY" | "MONTH" | "PROJECT" | "UNBOUNDED";
  spent: number;
  reserved: number;
  status: "ACTIVE" | "EXHAUSTED" | "PAUSED";
}

// ---------------------------------------------------------------------------
// events schema
// ---------------------------------------------------------------------------

export interface DomainEventsTable extends TenantScoped {
  id: Generated<string>;
  type: string;
  version: number;
  aggregate_type: string;
  aggregate_id: string;
  actor_type: string;
  actor_id: string;
  correlation_id: string | null;
  causation_id: string | null;
  payload: unknown;
  occurred_at: Generated<Date>;
}

export interface OutboxEventsTable extends TenantScoped {
  id: Generated<string>;
  event_id: string;
  event_type: string;
  payload: unknown;
  status: "PENDING" | "PUBLISHED" | "FAILED";
  attempts: Generated<number>;
  available_at: Generated<Date>;
  published_at: Date | null;
  last_error: string | null;
}

// ---------------------------------------------------------------------------
// audit schema
// ---------------------------------------------------------------------------

export interface AuditEventsTable extends TenantScoped {
  id: Generated<string>;
  actor_type: string;
  actor_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  request_id: string | null;
  workflow_run_id: string | null;
  agent_run_id: string | null;
  metadata: unknown;
  created_at: Generated<Date>;
}

// ---------------------------------------------------------------------------
// Mycelium canonical control plane
// ---------------------------------------------------------------------------

export interface MyceliumIntentsTable extends TenantScoped { id: Generated<string>; requested_by_actor_type: string; requested_by_actor_id: string; text: string; status: "DRAFT" | "CONFIRMED" | "CANCELLED" | "COMPLETED"; version: Generated<number>; created_at: Generated<Date>; updated_at: Generated<Date>; }
export interface MyceliumExecutionPlansTable extends TenantScoped { id: Generated<string>; intent_id: string; status: "PREVIEW" | "CONFIRMED" | "SUPERSEDED" | "COMPLETED"; plan: unknown; version: Generated<number>; confirmed_by_actor_type: string | null; confirmed_by_actor_id: string | null; confirmed_at: Date | null; created_at: Generated<Date>; updated_at: Generated<Date>; }
export interface MyceliumWorkUnitsTable extends TenantScoped { id: Generated<string>; intent_id: string; plan_id: string; title: string; description: string; status: "DRAFT" | "QUEUED" | "LEASED" | "RUNNING" | "AWAITING_REVIEW" | "REVISION_REQUIRED" | "ACCEPTED" | "BLOCKED" | "ESCALATED" | "CANCELLED"; assigned_worker_id: string | null; role_version_id: string | null; output_contract: unknown | null; version: Generated<number>; created_at: Generated<Date>; updated_at: Generated<Date>; }
export interface MyceliumRunsTable extends TenantScoped { id: Generated<string>; work_unit_id: string; worker_id: string; role_version_id: string; workspace_ref: string | null; authority_manifest_hash: string; status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED"; started_at: Date | null; completed_at: Date | null; version: Generated<number>; created_at: Generated<Date>; }
export interface MyceliumEvidenceTable extends TenantScoped { id: Generated<string>; work_unit_id: string; run_id: string | null; kind: string; uri: string; content_hash: string; immutable_at: Generated<Date>; }
export interface MyceliumGuardianDecisionsTable extends TenantScoped { id: Generated<string>; work_unit_id: string; run_id: string | null; guardian_actor_type: string; guardian_actor_id: string; outcome: "ACCEPT" | "REVISE" | "ESCALATE" | "REJECT"; rationale: string; evidence_ids: unknown; decided_at: Generated<Date>; }
export interface MyceliumCriticReviewsTable extends TenantScoped { id: Generated<string>; work_unit_id: string; run_id: string; critic_worker_id: string; outcome: "PASS" | "REVISE" | "ESCALATE"; rationale: string; created_at: Generated<Date>; }
export interface MyceliumMemoryRecordsTable extends TenantScoped { id: Generated<string>; evidence_id: string; content: string; created_at: Generated<Date>; }
/** Explicit authority proof; command authority is never inferred from membership. */
export interface MyceliumActorRoleAssignmentsTable extends TenantScoped { id: Generated<string>; actor_type: "HUMAN" | "AGENT" | "SYSTEM"; actor_id: string; role_version_id: string; status: "ACTIVE" | "REVOKED"; effective_from: Date; effective_until: Date | null; assigned_by_actor_type: "HUMAN" | "AGENT" | "SYSTEM"; assigned_by_actor_id: string; revoked_by_actor_type: "HUMAN" | "AGENT" | "SYSTEM" | null; revoked_by_actor_id: string | null; revoked_at: Date | null; revocation_reason: string | null; created_at: Generated<Date>; }
/** Append-only observed execution spend. Values are actuals, never estimates. */
export interface MyceliumCostLedgerEntriesTable extends TenantScoped { id: Generated<string>; work_unit_id: string; run_id: string; source_kind: "MODEL_USAGE" | "TOOL_EXECUTION" | "INFRASTRUCTURE"; source_reference: string; idempotency_key: string; amount_minor: number; currency: string; usage: unknown; observed_at: Date; recorded_by_actor_type: "HUMAN" | "AGENT" | "SYSTEM"; recorded_by_actor_id: string; recorded_at: Generated<Date>; }

// ---------------------------------------------------------------------------
// Database interface
// ---------------------------------------------------------------------------

export interface Database {
  "identity.users": UsersTable;
  "org.organisations": OrganisationsTable;
  "org.memberships": MembershipsTable;
  "org.departments": DepartmentsTable;
  "governance.constitutions": ConstitutionsTable;
  "roles.role_specs": RoleSpecsTable;
  "roles.role_versions": RoleVersionsTable;
  "work.projects": ProjectsTable;
  "work.goals": GoalsTable;
  "work.milestones": MilestonesTable;
  "work.tasks": TasksTable;
  "work.task_dependencies": TaskDependenciesTable;
  "work.workflow_definitions": WorkflowDefinitionsTable;
  "work.workflow_runs": WorkflowRunsTable;
  "agents.instances": AgentInstancesTable;
  "agents.runs": AgentRunsTable;
  "tools.capabilities": CapabilitiesTable;
  "tools.connections": ToolConnectionsTable;
  "tools.actions": ToolActionsTable;
  "tools.approval_requests": ApprovalRequestsTable;
  "memory.records": MemoryRecordsTable;
  "memory.documents": DocumentsTable;
  "memory.document_versions": DocumentVersionsTable;
  "relationships.external_organisations": ExternalOrganisationsTable;
  "relationships.contacts": ContactsTable;
  "relationships.interactions": InteractionsTable;
  "finance.budgets": BudgetsTable;
  "events.domain_events": DomainEventsTable;
  "events.outbox": OutboxEventsTable;
  "audit.events": AuditEventsTable;
  "mycelium.intents": MyceliumIntentsTable;
  "mycelium.execution_plans": MyceliumExecutionPlansTable;
  "mycelium.work_units": MyceliumWorkUnitsTable;
  "mycelium.runs": MyceliumRunsTable;
  "mycelium.evidence": MyceliumEvidenceTable;
  "mycelium.guardian_decisions": MyceliumGuardianDecisionsTable;
  "mycelium.critic_reviews": MyceliumCriticReviewsTable;
  "mycelium.memory_records": MyceliumMemoryRecordsTable;
  "mycelium.actor_role_assignments": MyceliumActorRoleAssignmentsTable;
  "mycelium.cost_ledger_entries": MyceliumCostLedgerEntriesTable;
}
