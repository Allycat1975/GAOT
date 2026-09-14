# Genesis/Paperclip Phase 4 acceptance audit

This is local implementation evidence, not production sign-off. The PRD
prohibits push/deploy/production mutation/credential creation without separate
owner approval.

| Gate | Current evidence | Status |
|---|---|---|
| A1/A2 | Read-only projection facade and canonical command/history are separate; GAOT now serves binding-scoped last-known targets for HTTP and connection failures when Mycelium is unavailable | A1 local failover tests pass; live A1/A2 rehearsal pending |
| A3 | Central donor guard plus issue route/service guards; `issue`, `work_unit`, and `work-unit` aliases covered | Local pass; live bound-target rehearsal pending |
| A4 | Mycelium worker control gates claim, checkout, heartbeat and scheduling | Local code evidence; live rehearsal pending |
| A5/A6 | Mycelium service requires independent Critic PASS and exact Guardian run evidence | 18 control-plane tests pass; live rehearsal pending |
| A7 | Projection writer rejects stale, replayed, conflicting and re-pointed bindings; concrete adapters cover company, worker, goal, WorkUnit, run, activity, evidence, and cost | Focused projection/adapter/guard tests pass (8); distributed concurrency not rehearsed |
| A8 | HMAC envelope, expiry, nonce replay protection and exact Guardian evidence | 15 Tool Gateway tests pass; live credential-order rehearsal pending |
| A9 | Supabase JWT maps to active HUMAN actor and Postgres RoleVersion context | Live positive command returned `201` (`commandId=e566bb7b-adc9-4ec9-b885-8f72a251245e`); five negative authority cases returned `403`; Supabase records two intents, domain events, and audit events |
| A10 | 21 migration/RLS/raw-SQL checks, API/control/tool tests pass | Official Paperclip corpus substitution is owner-approved and inventory checks pass; production API composition is authored; Docker/embedded-Postgres execution remains unavailable on this Windows host |

## Verified commands

- `pnpm db:validate`: 21 migrations, RLS smoke and Guardian raw-SQL guard all OK.
- `pnpm --filter @genesis/mycelium-api test`: 6/6.
- `pnpm --filter @genesis/mycelium-api typecheck`: OK.
- `pnpm --filter @genesis/mycelium-api build`: OK.
- `pnpm --filter @genesis/mycelium-control-plane test`: 18/18.
- `pnpm --filter @genesis/mycelium-control-plane build`: OK.
- `pnpm --filter @genesis/tool-gateway test`: 15/15.
- `pnpm --filter @genesis/tool-gateway typecheck`: OK.
- `pnpm typecheck`: 23/23 workspace tasks successful.
- `pnpm build`: 13/13 workspace tasks successful.
- `pnpm test`: 17/17 workspace tasks successful (including the no-test
  `@genesis/tool-sdk` package with `--passWithNoTests`).
- GAOT focused projection/ingress/mutation tests: 6/6.
- GAOT projection-failover test: 3/3 (including binding-scoped last-known fallback); the fallback reader itself passes a focused TypeScript check.

## Owner-approved update (2026-09-13)

- The approved branch was pushed to `origin/genesis/main`.
- Supabase now has all 21 migrations, a confirmed HUMAN actor, and an active
  actor-role assignment. The API bound to the Supabase pooler and returned live
  health; managed ES256 JWKS authentication succeeded.
- The approved schema-valid Guardian RoleVersion is active. It grants only
  `mycelium.intent.create` (`ALLOW`, `AUTO`); a live governed intent command
  returned `201` and persisted canonical/audit events.
- A production runtime composition was added to the canonical MYCI workspace at
  `infra/production/`: stateless API container, Supabase `DATABASE_URL`/JWKS,
  Ollama endpoint, healthcheck, and secret-manager `.env.example`. No secret or
  fixture data is committed. Docker is not installed on this Windows host, so
  image build/compose startup remains an external runner step.
- The runner workflow-traceability verifier is Windows-safe (`pathToFileURL`)
  and passes with 44 findings across 12 workflows. The remaining full-runner
  build stop is environmental: Rust/Cargo is not installed on this host.
- A hosted Ubuntu workflow, `.github/workflows/genesis-prd-gate.yml`, now runs
  the runner build plus full workspace typecheck, test, and build on every
  `genesis/main` push, providing the missing native-toolchain verification lane.
- The official Paperclip repository contains five eval YAML suites under
  `evals/promptfoo/tests`. The required private
  `paperclip-evals/paperclip-skill-optimization` corpus is absent; the
  owner-approved waiver uses the official Promptfoo cases and is documented in
  `EVAL-CORPUS-WAIVER-2026-09-13.md`.

## Historical external completion inputs (superseded by owner-approved waiver)

The following paragraph is retained as historical context only; current status
is the owner-approved official Paperclip eval waiver and the A1-A8 live matrix.

Production completion requires the real Supabase database password/JWT secret,
service token and deployment environment, explicit migration approval, live
A1–A9 rehearsals, and the vendor `paperclip-evals/paperclip-skill-optimization`
corpus. That prerequisite list is superseded by the owner-approved waiver.
No fixture data is accepted as production evidence.
