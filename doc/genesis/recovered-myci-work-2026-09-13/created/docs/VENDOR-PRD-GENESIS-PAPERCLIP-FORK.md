# Genesis Holdings / MYCI — Paperclip Fork Completion PRD

Date: 2026-09-13  
Owner: Genesis Holdings / MYCI  
Implementation repositories:

- GAOT fork: `C:\Users\Laurien\Downloads\GAOT`
- Mycelium canonical control plane: `C:\Users\Laurien\Downloads\MYCI COMPANY`

## 1. Objective

Complete the Paperclip fork as GAOT: a Genesis-branded operator shell and
execution-host layer backed by Mycelium as the sole canonical control plane
for MYCI companies.

This is not a cosmetic rebrand and it is not a second company-management
system. GAOT presents and hosts governed work. Mycelium owns authoritative
company, authority, Intent, Plan, WorkUnit, Run, Critic, Guardian, Evidence,
Memory and cost state.

The normative inputs are the two supplied documents:

- `PAPERCLIP REPO-LEVEL FORK SPECIFICATION`
- the accompanying Paperclip architecture review/recommendation

When they conflict, preserve the stricter Mycelium ownership and governance
boundary.

## 2. Non-negotiable architecture

```text
Mycelium canonical state -> GAOT projection -> Paperclip-derived UI
GAOT operator request -> governed Mycelium command -> canonical acknowledgement
```

1. Mycelium is the only canonical writer for MYCI company and governance
   state.
2. GAOT/Paperclip issue, worker, approval, plugin, routine and heartbeat
   routes are never a second write path for a Mycelium-bound record.
3. A GAOT `done` presentation state means canonical Mycelium `ACCEPTED` only.
   A completed/succeeded Run is never acceptance.
4. Critic review and Guardian verdict are different steps. An executor cannot
   Critic-review itself or Guardian-accept its own output.
5. Mycelium-controlled workers cannot self-select work or be scheduled by
   Paperclip heartbeat/checkout logic.
6. Business credentials are available only through the Tool Gateway with a
   valid Mycelium authorization envelope. No generic agent secret injection.
7. Projections repair in one direction only: Mycelium -> GAOT. Stale GAOT
   projection data may be read, but it cannot authorize a command.
8. Plugins cannot grant authority, accept WorkUnits, create accepted evidence,
   create institutional memory, or bypass Guardian review.
9. Live GAOT surfaces may not show seed/demo data as canonical state.
10. Preserve Paperclip provenance, MIT notices and upstream-merge ability;
    do not mass-rename donor package names before the seam is stable.

## 3. Scope and delivery order

### Phase 1 — Fork extraction and boundary establishment

- Preserve fork provenance and an upstream reference branch.
- Add Genesis ownership/status/governance/upstream documents.
- Create typed Mycelium contracts and a fail-closed GAOT read client.
- Add a one-way projection binding registry.
- Configure Genesis/GAOT presentation branding without a broad donor rewrite.

### Phase 2 — Canonical control-plane foundation

- Create canonical Mycelium tables, immutable evidence, Guardian and Critic
  database invariants, command service and transactional audit/outbox events.
- Make GAOT reads use server-side binding resolution from local company ID to
  canonical company ID. Never accept a browser-supplied canonical ID.
- Add monotonic/idempotent projection writer and canonical status mapping.

### Phase 3 — Runtime and governance enforcement

- Guard legacy donor mutation services for every bound target and child
  resource.
- Block donor heartbeat, queued-run claim and issue self-checkout for
  Mycelium-controlled workers.
- Add explicit actor-to-RoleVersion assignment and fail-closed policy
  composition.
- Require Tool Gateway authorization envelopes, replay protection and exact
  Guardian evidence for R3 actions.

### Phase 4 — Production completion

- Provide authenticated command transport only after a real actor-role/context
  resolver and policy composition are deployed.
- Implement all target-specific projection adapters, not merely binding
  metadata.
- Complete projection guards across remaining mutable donor entity families.
- Provide durable signature verifier, nonce store and Guardian-evidence
  adapter for Tool Gateway.
- Deploy with migrated Postgres, actual secrets, observability, backup/recovery
  and no fixture data.

## 4. Required acceptance tests

| ID | Required proof |
| --- | --- |
| A1 | Turn off Mycelium: GAOT can show last-known projection but cannot command or execute MYCI work. |
| A2 | Turn off GAOT: Mycelium retains canonical history, authority and governance. |
| A3 | Attempt generic GAOT PATCH/checkout/comment/document/attachment on a bound WorkUnit projection: fail with explicit 409. |
| A4 | Attempt Paperclip heartbeat/self-checkout for a Mycelium-controlled worker: explicit denial; no donor queue/run is created. |
| A5 | Exhaustive status mapping proves only `ACCEPTED` maps to `done`. |
| A6 | Critic PASS only yields `AWAITING_REVIEW`; only Guardian acceptance with exact run and evidence yields `ACCEPTED`. |
| A7 | Replayed, stale, conflicting and re-pointed projection events do not alter a newer target. |
| A8 | Tool action without/mismatched/expired/replayed envelope is denied before credential resolution; R3 also needs exact canonical Guardian evidence. |
| A9 | A missing or inactive actor-to-RoleVersion assignment is denied; donor membership is not treated as authority. |
| A10 | Full test/typecheck/build and migrated integration environment pass with no live fixture data. |

## 5. Explicit non-goals

- Do not replace the existing Paperclip stack wholesale with another framework.
- Do not publish/push any branch, deploy service, alter production database or
  create credentials without separate owner approval.
- Do not delete existing worktree changes merely to obtain a clean status.
- Do not expose a broad canonical PATCH/POST API.

