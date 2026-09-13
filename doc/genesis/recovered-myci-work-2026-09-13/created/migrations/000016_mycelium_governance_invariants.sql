-- 000016_mycelium_governance_invariants.sql
-- Database-enforced governance invariants. Application services provide the
-- workflow; these triggers prevent a bypass through arbitrary SQL paths.

CREATE FUNCTION mycelium.enforce_critic_independence()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE executor_id uuid;
BEGIN
  SELECT worker_id INTO executor_id FROM mycelium.runs WHERE id = NEW.run_id;
  IF executor_id IS NULL THEN
    RAISE EXCEPTION 'critic review references an unknown run';
  END IF;
  IF executor_id = NEW.critic_worker_id THEN
    RAISE EXCEPTION 'executor cannot review its own run';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER mycelium_critic_independence
BEFORE INSERT OR UPDATE OF critic_worker_id, run_id ON mycelium.critic_reviews
FOR EACH ROW EXECUTE FUNCTION mycelium.enforce_critic_independence();

CREATE FUNCTION mycelium.enforce_guardian_independence()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE executor_id uuid;
BEGIN
  IF NEW.outcome = 'ACCEPT' AND NEW.run_id IS NULL THEN
    RAISE EXCEPTION 'Guardian acceptance requires an exact run';
  END IF;
  IF NEW.guardian_actor_type = 'AGENT' AND NEW.run_id IS NOT NULL THEN
    SELECT worker_id INTO executor_id FROM mycelium.runs WHERE id = NEW.run_id;
    IF executor_id = NEW.guardian_actor_id THEN
      RAISE EXCEPTION 'executor cannot accept its own output';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER mycelium_guardian_independence
BEFORE INSERT OR UPDATE OF guardian_actor_type, guardian_actor_id, run_id, outcome ON mycelium.guardian_decisions
FOR EACH ROW EXECUTE FUNCTION mycelium.enforce_guardian_independence();

CREATE FUNCTION mycelium.enforce_acceptance_provenance()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'ACCEPTED' AND NOT EXISTS (
    SELECT 1 FROM mycelium.guardian_decisions decision
    WHERE decision.work_unit_id = NEW.id
      AND decision.outcome = 'ACCEPT'
  ) THEN
    RAISE EXCEPTION 'only a Guardian decision may accept a WorkUnit';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER mycelium_acceptance_provenance
BEFORE INSERT OR UPDATE OF status ON mycelium.work_units
FOR EACH ROW EXECUTE FUNCTION mycelium.enforce_acceptance_provenance();

CREATE FUNCTION mycelium.enforce_evidence_immutability()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Evidence is immutable';
END;
$$;

CREATE TRIGGER mycelium_evidence_immutable
BEFORE UPDATE OR DELETE ON mycelium.evidence
FOR EACH ROW EXECUTE FUNCTION mycelium.enforce_evidence_immutability();

CREATE FUNCTION mycelium.enforce_memory_provenance()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM mycelium.guardian_decisions decision
    JOIN mycelium.evidence evidence ON evidence.work_unit_id = decision.work_unit_id
    WHERE evidence.id = NEW.evidence_id
      AND decision.outcome = 'ACCEPT'
      AND decision.evidence_ids @> jsonb_build_array(NEW.evidence_id::text)
  ) THEN
    RAISE EXCEPTION 'Memory requires Guardian-accepted evidence';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER mycelium_memory_provenance
BEFORE INSERT OR UPDATE OF evidence_id ON mycelium.memory_records
FOR EACH ROW EXECUTE FUNCTION mycelium.enforce_memory_provenance();
