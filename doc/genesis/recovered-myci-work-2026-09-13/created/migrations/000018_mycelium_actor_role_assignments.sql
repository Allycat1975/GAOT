-- Canonical actor-to-RoleVersion proof for Mycelium commands.
-- A membership label, agent role field, or raw caller id is never authority.

CREATE TABLE mycelium.actor_role_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id uuid NOT NULL REFERENCES org.organisations(id) ON DELETE RESTRICT,
    actor_type text NOT NULL CHECK (actor_type IN ('HUMAN', 'AGENT', 'SYSTEM')),
    actor_id uuid NOT NULL,
    role_version_id uuid NOT NULL REFERENCES roles.role_versions(id) ON DELETE RESTRICT,
    status text NOT NULL CHECK (status IN ('ACTIVE', 'REVOKED')),
    effective_from timestamptz NOT NULL DEFAULT now(),
    effective_until timestamptz,
    assigned_by_actor_type text NOT NULL CHECK (assigned_by_actor_type IN ('HUMAN', 'AGENT', 'SYSTEM')),
    assigned_by_actor_id uuid NOT NULL,
    revoked_by_actor_type text CHECK (revoked_by_actor_type IN ('HUMAN', 'AGENT', 'SYSTEM')),
    revoked_by_actor_id uuid,
    revoked_at timestamptz,
    revocation_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (effective_until IS NULL OR effective_until > effective_from),
    CHECK ((status = 'ACTIVE') = (revoked_at IS NULL)),
    CHECK ((revoked_at IS NULL) = (revoked_by_actor_type IS NULL)),
    CHECK ((revoked_at IS NULL) = (revoked_by_actor_id IS NULL)),
    CHECK ((revoked_at IS NULL) = (revocation_reason IS NULL))
);

-- One currently active authority binding per actor and organisation.
CREATE UNIQUE INDEX mycelium_actor_role_assignments_one_active_idx
    ON mycelium.actor_role_assignments (organisation_id, actor_type, actor_id)
    WHERE status = 'ACTIVE';
CREATE INDEX mycelium_actor_role_assignments_lookup_idx
    ON mycelium.actor_role_assignments (organisation_id, actor_type, actor_id, effective_from DESC);

CREATE OR REPLACE FUNCTION mycelium_validate_actor_role_assignment()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM roles.role_versions rv
        WHERE rv.id = NEW.role_version_id AND rv.organisation_id = NEW.organisation_id
    ) THEN
        RAISE EXCEPTION 'actor role assignment role version must belong to its organisation';
    END IF;

    -- SYSTEM has no inferred donor identity. Its explicit canonical binding is
    -- its authority record; human/agent references are independently proven.
    IF NEW.actor_type = 'HUMAN' AND NOT EXISTS (
        SELECT 1 FROM identity.users u WHERE u.id = NEW.actor_id
    ) THEN
        RAISE EXCEPTION 'human actor role assignment requires an identity user';
    ELSIF NEW.actor_type = 'AGENT' AND NOT EXISTS (
        SELECT 1 FROM agents.instances a
        WHERE a.id = NEW.actor_id AND a.organisation_id = NEW.organisation_id
    ) THEN
        RAISE EXCEPTION 'agent actor role assignment requires an in-organisation agent instance';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER mycelium_actor_role_assignment_tenant_guard
    BEFORE INSERT OR UPDATE ON mycelium.actor_role_assignments
    FOR EACH ROW EXECUTE FUNCTION mycelium_validate_actor_role_assignment();

ALTER TABLE mycelium.actor_role_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON mycelium.actor_role_assignments
    USING (organisation_id = current_organisation_id())
    WITH CHECK (organisation_id = current_organisation_id());
