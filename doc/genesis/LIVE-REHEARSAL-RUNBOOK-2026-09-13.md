# Genesis/Mycelium live rehearsal runbook

This runbook is for a Linux/Docker runner with a GAOT-compatible PostgreSQL
database and the already migrated Supabase Mycelium project. It uses no seed or
fixture records; IDs must be discovered from the live binding tables.

## Runtime preflight

```sh
export DATABASE_URL='postgresql://<gaot-runtime>@<gaot-host>/<database>'
export MYCELIUM_API_URL='http://127.0.0.1:3200'
export MYCELIUM_API_TOKEN='<runtime-token>'
export SUPABASE_JWKS_URL='https://edlzrketqepqvnjhrbrm.supabase.co/auth/v1/.well-known/jwks.json'
export OLLAMA_BASE_URL='http://ollama:11434'
export OLLAMA_MODEL='deepseek-v4-flash'
```

Start the canonical API using `infra/production/docker-compose.yml` and verify
authenticated `GET /v1/health` returns `200` and `status=live`.

## Acceptance sequence

1. **A1** — stop the Mycelium API; GAOT reads the binding-scoped last-known
   projection, while any command request is rejected and Supabase intent/event
   counts do not change. Restart Mycelium afterward.
2. **A2** — stop GAOT only; query the canonical `mycelium.intents`,
   `events.domain_events`, and `audit.events` tables and verify the prior
   command remains present. Restart GAOT afterward.
3. **A3** — select a live bound WorkUnit from
   `genesis_projection_bindings`; attempt PATCH, checkout, comment, document,
   and attachment mutations through GAOT. Every response must be HTTP `409`
   with `mycelium_projection_target_locked` and no row change.
4. **A4** — invoke heartbeat, queued-run claim, and self-checkout for a bound
   worker. Each request must be denied (`409`/`403` per route contract), with no
   donor queue/run created.
5. **A5** — exercise every canonical WorkUnit status and verify only
   `ACCEPTED` is presented as GAOT `done`.
6. **A6** — submit an independent Critic `PASS`; verify status is
   `AWAITING_REVIEW`. Submit Guardian acceptance with an exact run/evidence
   match; verify and only then observe canonical `ACCEPTED`/GAOT `done`.
7. **A7** — replay a projection event, send a stale version, equal-version
   conflicting content, and a re-pointed target. Each must be ignored or
   rejected without changing the newer target.
8. **A8** — call a tool with absent, mismatched, expired, and replayed envelope;
   verify denial occurs before credential resolution. For R3, provide a
   Guardian evidence row whose capability and payload hash match exactly.
9. **A9** — repeat the command with a missing, expired, revoked, and
   cross-tenant actor-role assignment; each must be denied. Donor membership
   alone must never authorize the command.

## Evidence capture

Record HTTP status/body, API logs, and before/after row counts for every step.
The final evidence packet must include the migration validator output, the
command IDs, and the Supabase counts for intents, domain events, audit events,
role assignments, and Tool Gateway nonces. Do not export access tokens,
database passwords, or fixture data.
