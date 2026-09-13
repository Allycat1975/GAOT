# Mycelium API v1

`apps/mycelium-api` is the only service that exposes canonical MYCI state to
GAOT. It reads PostgreSQL through a dedicated read port and does not expose a
generic mutation endpoint.

## Startup

The service fails closed unless all of the following are supplied:

- `DATABASE_URL` — canonical PostgreSQL connection string;
- `MYCELIUM_API_TOKEN` — a secret of at least 32 characters; and
- optional `MYCELIUM_API_PORT` — defaults to loopback port `3200`.
- optional `SUPABASE_JWT_SECRET` — at least 32 characters; enables named
  command routes with Supabase-authenticated human actors.

Before starting the service, apply the canonical migrations:

```text
pnpm db:migrate
```

In particular, migration `000015_mycelium_control_plane.sql` creates the
authoritative lifecycle tables and `000016_mycelium_governance_invariants.sql`
enforces Guardian, Critic, Evidence, and Memory rules. An unmigrated database
must not be treated as a live Mycelium control plane.

It binds to `127.0.0.1` by default. Put an authenticated reverse proxy or
private service mesh in front of it before any non-local deployment.

## Supabase and Ollama deployment mapping

Supabase is the canonical PostgreSQL provider for a deployment. Its pooled or
direct PostgreSQL connection string is supplied as `DATABASE_URL`; Supabase
does not supply `MYCELIUM_API_TOKEN` or the API listener port. Apply all
canonical migrations, including `000020_mycelium_guardian_acceptance_provenance.sql`,
to that project before declaring the API live.

Ollama is a worker-model provider, not a control-plane authority or database.
The worker runtime may point at an Ollama endpoint (for example,
`OLLAMA_BASE_URL=http://ollama:11434` and an approved `OLLAMA_MODEL`), but model
output remains a proposal/execution result. Only the governed Mycelium command
service may change canonical state, and only a Guardian decision can produce
`ACCEPTED`.

## Authentication

Every endpoint, including health, requires:

```text
Authorization: Bearer <MYCELIUM_API_TOKEN>
```

Named command routes additionally require a verified Supabase access token in
`X-Supabase-Access-Token`. The actor is resolved from the active
`identity.users.auth_subject` row; request-body actor IDs are never trusted.

The comparison is timing-safe. Failed authentication returns `401`; a failed
canonical read returns `503` rather than an invented projection.

## Read endpoints

| Endpoint | Canonical source |
| --- | --- |
| `GET /v1/health` | PostgreSQL reachability |
| `GET /v1/companies/:id` | `org.organisations` |
| `GET /v1/companies/:id/workers` | `agents.instances` |
| `GET /v1/companies/:id/goals` | `work.goals` |
| `GET /v1/companies/:id/work-units` | `mycelium.work_units` |
| `GET /v1/companies/:id/runs` | `mycelium.runs` |
| `GET /v1/companies/:id/activity` | `events.domain_events` |
| `GET /v1/companies/:id/costs` | immutable, observed `mycelium.cost_ledger_entries` only |
| `GET /v1/companies/:id/evidence` | `mycelium.evidence` |

Legacy task records are not authoritative Mycelium work units. `ACCEPTED` is
only produced after a Guardian decision for the exact canonical run.

## Mutation policy

There are no `POST`, `PUT`, `PATCH`, or `DELETE` routes in v1. The internal
`@genesis/mycelium-control-plane` package supplies named command handlers for
intent creation, plan confirmation, work-unit dispatch, and Guardian verdicts.
It fails closed unless an injected policy/RoleFactory-backed authorizer returns
`ALLOW`; every PostgreSQL command transaction writes the canonical change,
append-only audit record, and transactional-outbox event together. It is not
an HTTP router and must not be bypassed by a donor repository or generic patch
route.

The deployment composition root is responsible for providing the authorizer.
Until it does, commands are intentionally unreachable from GAOT and this
read-only API.
