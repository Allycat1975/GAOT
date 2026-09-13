# Vendor Handoff — Genesis / GAOT / Mycelium

Date: 2026-09-13  
Status: implementation is incomplete; use this document and current source as
the authority, not verbal summaries.

## Repositories and safety

| Item | Location | State |
| --- | --- | --- |
| GAOT | `C:\Users\Laurien\Downloads\GAOT` | Git fork, branch `genesis/main`; local commits exist; no push was made by this work. |
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
- Read-only GAOT facade/UI: `server/src/routes/mycelium-projections.ts`, `ui/src/pages/MyceliumControlPlane.tsx`

### GAOT known verification limitation

Focused TypeScript checks emitted no diagnostics. Several Vitest/Vite runs on
this Windows checkout spawned/hung workers before returning results. Do not
mark GAOT complete from narrow compile evidence. Re-run verification in a clean
environment, then investigate the donor Windows runner issue separately.

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

### Present but must be independently revalidated

The following files/migrations appeared during interrupted worker sessions.
Their presence is evidence of work, not proof of correct completion:

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

Known prior results before the latest partial files: Mycelium API tests 3/3,
command/control-plane tests 12/12, policy-engine tests 27/27, Tool Gateway
tests 14/14, and migration validation through migration 17. Re-run all of the
above after reviewing migrations 18/19.

## Remaining work required for actual completion

1. Review and verify actor-role assignment migration/resolver. Explicit actor
   assignment must be canonical; do not infer authority from a donor
   membership. Human identity, agent tenancy and active RoleVersion must be
   checked.
2. Review and verify canonical cost ledger. It must be immutable, tenant/run/
   WorkUnit cohesive and idempotent. GAOT cost projections must use it only
   after this passes.
3. Build target-specific projection adapters and wire the monotonic writer to
   actual Company/Worker/Goal/WorkUnit/Run/Evidence/Cost targets.
4. Extend bound-resource protection from issues to remaining mutable donor
   entity families; identify and prohibit raw database bypasses.
5. Create real deployment composition for PolicyEngine command authorizer:
   authenticated actor identity -> explicit role assignment -> active role /
   organisation/context resolver. Keep command transport disabled until this
   exists.
6. Supply production Tool Gateway adapters for envelope signatures, nonce
   storage and exact Guardian evidence. Do not use in-memory stores in
   production.
7. Provision a migrated Postgres environment and configured `MYCELIUM_API_*`
   values. Do not fabricate a token or seed canonical production data.
8. Run the full GAOT verification suite in a clean environment and resolve the
   Windows test-worker issue; then run end-to-end acceptance tests A1–A10 in
   the PRD.

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

