-- 000015_mycelium_control_plane.sql
-- Canonical MYCI lifecycle. These tables are not Paperclip projections and
-- must only be changed through governed Mycelium application services.

CREATE SCHEMA IF NOT EXISTS mycelium;

CREATE TABLE mycelium.intents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id uuid NOT NULL REFERENCES org.organisations(id) ON DELETE RESTRICT,
    requested_by_actor_type text NOT NULL,
    requested_by_actor_id uuid NOT NULL,
    text text NOT NULL CHECK (length(trim(text)) > 0),
    status text NOT NULL CHECK (status IN ('DRAFT', 'CONFIRMED', 'CANCELLED', 'COMPLETED')),
    version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mycelium.execution_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id uuid NOT NULL REFERENCES org.organisations(id) ON DELETE RESTRICT,
    intent_id uuid NOT NULL REFERENCES mycelium.intents(id) ON DELETE RESTRICT,
    status text NOT NULL CHECK (status IN ('PREVIEW', 'CONFIRMED', 'SUPERSEDED', 'COMPLETED')),
    plan jsonb NOT NULL DEFAULT '{}'::jsonb,
    version integer NOT NULL DEFAULT 1,
    confirmed_by_actor_type text,
    confirmed_by_actor_id uuid,
    confirmed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((status = 'CONFIRMED') = (confirmed_at IS NOT NULL))
);

CREATE TABLE mycelium.work_units (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id uuid NOT NULL REFERENCES org.organisations(id) ON DELETE RESTRICT,
    intent_id uuid NOT NULL REFERENCES mycelium.intents(id) ON DELETE RESTRICT,
    plan_id uuid NOT NULL REFERENCES mycelium.execution_plans(id) ON DELETE RESTRICT,
    title text NOT NULL CHECK (length(trim(title)) > 0),
    description text NOT NULL,
    status text NOT NULL CHECK (status IN ('DRAFT', 'QUEUED', 'LEASED', 'RUNNING', 'AWAITING_REVIEW', 'REVISION_REQUIRED', 'ACCEPTED', 'BLOCKED', 'ESCALATED', 'CANCELLED')),
    assigned_worker_id uuid REFERENCES agents.instances(id) ON DELETE RESTRICT,
    role_version_id uuid REFERENCES roles.role_versions(id) ON DELETE RESTRICT,
    output_contract jsonb,
    version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((assigned_worker_id IS NULL) = (role_version_id IS NULL))
);

CREATE TABLE mycelium.work_unit_dependencies (
    predecessor_work_unit_id uuid NOT NULL REFERENCES mycelium.work_units(id) ON DELETE RESTRICT,
    successor_work_unit_id uuid NOT NULL REFERENCES mycelium.work_units(id) ON DELETE RESTRICT,
    PRIMARY KEY (predecessor_work_unit_id, successor_work_unit_id),
    CHECK (predecessor_work_unit_id <> successor_work_unit_id)
);

CREATE TABLE mycelium.runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id uuid NOT NULL REFERENCES org.organisations(id) ON DELETE RESTRICT,
    work_unit_id uuid NOT NULL REFERENCES mycelium.work_units(id) ON DELETE RESTRICT,
    worker_id uuid NOT NULL REFERENCES agents.instances(id) ON DELETE RESTRICT,
    role_version_id uuid NOT NULL REFERENCES roles.role_versions(id) ON DELETE RESTRICT,
    workspace_ref text,
    authority_manifest_hash text NOT NULL,
    status text NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
    started_at timestamptz,
    completed_at timestamptz,
    version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((status IN ('SUCCEEDED', 'FAILED', 'CANCELLED')) = (completed_at IS NOT NULL))
);

CREATE TABLE mycelium.critic_reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id uuid NOT NULL REFERENCES org.organisations(id) ON DELETE RESTRICT,
    work_unit_id uuid NOT NULL REFERENCES mycelium.work_units(id) ON DELETE RESTRICT,
    run_id uuid NOT NULL REFERENCES mycelium.runs(id) ON DELETE RESTRICT,
    critic_worker_id uuid NOT NULL REFERENCES agents.instances(id) ON DELETE RESTRICT,
    outcome text NOT NULL CHECK (outcome IN ('PASS', 'REVISE', 'ESCALATE')),
    rationale text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mycelium.evidence (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id uuid NOT NULL REFERENCES org.organisations(id) ON DELETE RESTRICT,
    work_unit_id uuid NOT NULL REFERENCES mycelium.work_units(id) ON DELETE RESTRICT,
    run_id uuid REFERENCES mycelium.runs(id) ON DELETE RESTRICT,
    kind text NOT NULL,
    uri text NOT NULL,
    content_hash text NOT NULL,
    immutable_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organisation_id, content_hash)
);

CREATE TABLE mycelium.guardian_decisions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id uuid NOT NULL REFERENCES org.organisations(id) ON DELETE RESTRICT,
    work_unit_id uuid NOT NULL REFERENCES mycelium.work_units(id) ON DELETE RESTRICT,
    run_id uuid REFERENCES mycelium.runs(id) ON DELETE RESTRICT,
    guardian_actor_type text NOT NULL,
    guardian_actor_id uuid NOT NULL,
    outcome text NOT NULL CHECK (outcome IN ('ACCEPT', 'REVISE', 'ESCALATE', 'REJECT')),
    rationale text NOT NULL CHECK (length(trim(rationale)) > 0),
    evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
    decided_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (work_unit_id, run_id)
);

CREATE TABLE mycelium.memory_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id uuid NOT NULL REFERENCES org.organisations(id) ON DELETE RESTRICT,
    evidence_id uuid NOT NULL REFERENCES mycelium.evidence(id) ON DELETE RESTRICT,
    content text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organisation_id, evidence_id)
);

CREATE INDEX mycelium_intents_company_idx ON mycelium.intents (organisation_id, created_at DESC);
CREATE INDEX mycelium_work_units_company_idx ON mycelium.work_units (organisation_id, status, created_at DESC);
CREATE INDEX mycelium_runs_work_unit_idx ON mycelium.runs (work_unit_id, created_at DESC);
CREATE INDEX mycelium_guardian_work_unit_idx ON mycelium.guardian_decisions (work_unit_id, decided_at DESC);
