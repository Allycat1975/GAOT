-- 000019_mycelium_cost_ledger.sql
-- Immutable actual-cost observations from trusted execution infrastructure.
-- This is a ledger, never a budget estimate or a mutable aggregate.

CREATE TABLE mycelium.cost_ledger_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id uuid NOT NULL REFERENCES org.organisations(id) ON DELETE RESTRICT,
    work_unit_id uuid NOT NULL REFERENCES mycelium.work_units(id) ON DELETE RESTRICT,
    run_id uuid NOT NULL REFERENCES mycelium.runs(id) ON DELETE RESTRICT,
    source_kind text NOT NULL CHECK (source_kind IN ('MODEL_USAGE', 'TOOL_EXECUTION', 'INFRASTRUCTURE')),
    source_reference text NOT NULL CHECK (length(trim(source_reference)) > 0),
    idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) > 0),
    amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
    currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    usage jsonb NOT NULL,
    observed_at timestamptz NOT NULL,
    recorded_by_actor_type text NOT NULL CHECK (recorded_by_actor_type IN ('HUMAN', 'AGENT', 'SYSTEM')),
    recorded_by_actor_id uuid NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organisation_id, idempotency_key)
);

CREATE INDEX mycelium_cost_ledger_company_observed_idx
    ON mycelium.cost_ledger_entries (organisation_id, observed_at DESC);
CREATE INDEX mycelium_cost_ledger_run_idx
    ON mycelium.cost_ledger_entries (run_id, observed_at DESC);

-- A foreign key proves existence but not that the linked records belong to
-- one tenant or one execution. Enforce the complete canonical chain here.
CREATE FUNCTION mycelium.enforce_cost_ledger_execution_linkage()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  run_organisation_id uuid;
  run_work_unit_id uuid;
  work_unit_organisation_id uuid;
BEGIN
  SELECT organisation_id, work_unit_id INTO run_organisation_id, run_work_unit_id
    FROM mycelium.runs WHERE id = NEW.run_id;
  SELECT organisation_id INTO work_unit_organisation_id
    FROM mycelium.work_units WHERE id = NEW.work_unit_id;
  IF run_organisation_id IS NULL OR work_unit_organisation_id IS NULL
     OR run_organisation_id <> NEW.organisation_id
     OR work_unit_organisation_id <> NEW.organisation_id
     OR run_work_unit_id <> NEW.work_unit_id THEN
    RAISE EXCEPTION 'cost ledger entry must link one tenant, run, and work unit';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER mycelium_cost_ledger_execution_linkage
BEFORE INSERT ON mycelium.cost_ledger_entries
FOR EACH ROW EXECUTE FUNCTION mycelium.enforce_cost_ledger_execution_linkage();

CREATE FUNCTION mycelium.enforce_cost_ledger_immutability()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Cost ledger entries are immutable';
END;
$$;

CREATE TRIGGER mycelium_cost_ledger_immutable
BEFORE UPDATE OR DELETE ON mycelium.cost_ledger_entries
FOR EACH ROW EXECUTE FUNCTION mycelium.enforce_cost_ledger_immutability();
