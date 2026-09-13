# Vendor Handoff — Genesis / GAOT / Mycelium

Date: 2026-09-13  
Status: local implementation is complete for the governed Phase 4 code paths;
production/live acceptance remains pending external runtime inputs. Use this
document and current source as the authority, not verbal summaries.

## Repositories and safety

| Item | Location | State |
| --- | --- | --- |
| GAOT | `C:\Users\Laurien\Downloads\GAOT` | Git fork, branch `genesis/main`; approved changes are pushed to `origin/genesis/main`. |
| Mycelium | `C:\Users\Laurien\Downloads\MYCI COMPANY` | canonical workspace; it did not present as a Git repository during this work. Preserve all files. |
| Normative source documents | `C:\Users\Laurien\.codex\attachments\...\pasted-text.txt` | Read the two supplied attachments before changing architecture. |

Do not run `git reset --hard`, `git checkout --`, destructive cleanup, bulk
renames, migrations against a shared database, pushes or deployments during
initial takeover.

## GAOT local commit inventory

These are local commits visible at handoff. Validate with `git log --oneline`.

| Commit | Purpose |
| --- | --- |
| `2cca0bc4b` | fork provenance |
| `9857faa46` | Genesis Mycelium boundary documentation |
| `91f1c8772` | typed Mycelium contracts |
| `86899ab24` | fail-closed GAOT HTTP read client |
| `f0af6bacc` | canonical read projection routes |
| `8047da27a` | Genesis branding configuration |
| `9c3a8a6e0` | canonical API startup configuration |
| `12ed9d286` | projection binding registry/migration |
| `aca2dada4` / `74ebb8e7e` | delivery audit and current evidence ledger |
| `bd783706c` | local-ID-safe, read-only Mycelium control-plane UI |
| `a824cfee0` | monotonic projection writer and status mapper |
| `166e17329` | heartbeat/scheduling and central issue mutation guards |
| `5afcd5988` | bound issue child-resource guards |

Important GAOT source locations:

- Genesis boundary docs: `doc/genesis/`
- Delivery ledger: `doc/plans/2026-09-12-genesis-delivery-audit.md`
- Binding schema/migration: `packages/db/src/schema/genesis_projection_bindings.ts`, migration `0274_*`
- Projection writer: `server/src/mycelium/projection-writer.ts`
- Status mapper: `server/src/mycelium/status-mapping.ts`
- Scheduling guard: `server/src/mycelium/worker-control.ts`
- Shared issue guard: `server/src/mycelium/issue-projection-guard.ts`
- Binding-scoped A1 last-known fallback: `server/src/mycelium/last-known-projections.ts`
- Read-only GAOT facade/UI: `server/src/routes/mycelium-projections.ts`, `ui/src/pages/MyceliumControlPlane.tsx`

### GAOT known verification limitation

Focused projection/ingress/mutation Vitest checks pass 6/6. The embedded
Postgres issue integration test and the full GAOT workspace gate remain
environment-limited on this Windows checkout: the former times out and the
latter requires the external `paperclip-evals/paperclip-skill-optimization`
corpus. Do not fabricate that corpus or weaken the verifier.

## Mycelium implementation inventory

### Previously verified foundation

- Migrations `000015_mycelium_control_plane.sql` and
  `000016_mycelium_governance_invariants.sql` create canonical lifecycle and
  database governance triggers.
- `apps/mycelium-api` is deliberately GET-only and reads Mycelium state for
  GAOT; it is not a public canonical command API.
- `packages/mycelium-control-plane` contains governed command/store code for
  Intent, Plan confirmation, WorkUnit dispatch, Guardian verdict and Critic
  review. It uses transactional canonical mutation plus audit/domain/outbox
  events.
- `packages/tool-gateway` contains envelope enforcement ports and focused
  tests. It intentionally requires production implementations for signature
  validation, durable nonce consumption and Guardian evidence lookup.

### Present and locally revalidated

The following files/migrations are now present in the canonical workspace and
covered by the verification recorded below:

- `migrations/000017_mycelium_critic_review_uniqueness.sql`
- `migrations/000018_mycelium_actor_role_assignments.sql`
- `migrations/000019_mycelium_cost_ledger.sql`
- `packages/mycelium-control-plane/src/policy-authorizer.ts`
- `packages/mycelium-control-plane/src/postgres-authority-resolver.ts`
- `packages/mycelium-control-plane/src/cost-ledger.ts`
- `packages/mycelium-control-plane/src/cost-ledger.test.ts`
- `packages/mycelium-control-plane/src/postgres-authority-resolver.test.ts`

Required first validation commands (run sequentially with a bounded Node heap):

```powershell
$env:NODE_OPTIONS='--max-old-space-size=512'
pnpm --filter @genesis/mycelium-contracts build
pnpm --filter @genesis/policy-engine build
pnpm --filter @genesis/policy-engine test
pnpm --filter @genesis/mycelium-control-plane typecheck
pnpm --filter @genesis/mycelium-control-plane test
pnpm --filter @genesis/tool-gateway typecheck
pnpm --filter @genesis/tool-gateway test
node scripts/validate-migrations.mjs
```

Current results: Mycelium API 6/6, control-plane 18/18, Tool Gateway 15/15,
and migration/RLS/raw-SQL validation 21/21. The GAOT focused projection,
ingress and mutation tests pass 6/6.
The full Mycelium workspace typecheck passes 23/23 tasks and the full workspace
build passes 13/13 tasks.
The full workspace test suite passes 17/17 tasks; `@genesis/tool-sdk` is
configured with `--passWithNoTests` because it currently contains no test files.
GAOT projection failover tests pass 3/3, including serving a binding-scoped
last-known target when Mycelium is unavailable.

## Remaining work required for production completion

1. Run the live A1-A8 rehearsal matrix against the deployed GAOT/Mycelium
   runtime. A9 already passed against the approved Supabase project.
2. Run the full GAOT verification suite in a clean runner with Rust/Cargo and
   Docker available; this Windows host cannot perform those two steps.
3. The private `paperclip-evals/paperclip-skill-optimization` corpus is absent;
   the owner-approved official Paperclip corpus waiver is recorded in
   `doc/genesis/EVAL-CORPUS-WAIVER-2026-09-13.md`.

## Recommended takeover sequence

1. Read the two supplied specifications and GAOT `doc/genesis/*`.
2. Snapshot both worktrees and capture `git status`, `git log`, remotes and
   current migration list; do not delete anything.
3. Independently validate Mycelium migrations 15–19 and affected package
   tests.
4. Independently validate each GAOT commit after `paperclip-upstream` using
   targeted tests plus clean-environment server/UI checks.
5. Produce a requirement-to-test matrix for A1–A10. Do not call the fork
   complete until every row has executable proof.
