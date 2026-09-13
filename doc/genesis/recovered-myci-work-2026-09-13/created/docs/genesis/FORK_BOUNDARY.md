# Genesis GAOT fork boundary

## Decision

GAOT is a Paperclip-derived presentation and operator shell. Mycelium is the
canonical Genesis control plane. The two systems communicate only through
`@genesis/mycelium-contracts` ports.

This repository remains the Mycelium foundation. The donor checkout belongs at
`../gaot` and is pinned to Paperclip `v2026.831.0` (`dbf052577d073bdac511d796e763c0bbd0bd9bab`).
It must retain the MIT licence and upstream provenance.

## Ownership

| Domain | Canonical owner | GAOT role |
|---|---|---|
| company, roles, authority, goals | Mycelium | read projection |
| Intent, Plan, WorkUnit, Run | Mycelium | command/view adapter |
| Critic, Guardian, Evidence, Memory | Mycelium | command/view adapter |
| UI shell, navigation, workspaces, adapters, skills, routines, costs | GAOT/Paperclip | retained infrastructure |

## Non-negotiable invariants

1. Donor data is a projection, never a second source of truth.
2. Only `MyceliumCommandPort` changes canonical Genesis state.
3. A completed run is not accepted work; only a Guardian verdict can accept it.
4. Mycelium workers receive explicit WorkUnits and cannot self-select work.
5. Paperclip heartbeat processing cannot dispatch Mycelium work.
6. Paperclip approval cannot replace Guardian acceptance.
7. Business credentials remain behind the Tool Gateway; workers receive no unrestricted credentials.
8. A stale projection remains readable but cannot approve or execute a material command.

## Projection protocol

Each GAOT projection must retain the canonical aggregate ID, aggregate version,
source hash, and observation time. Events are applied idempotently in the one
permitted direction: `MYCELIUM → GAOT`. Reconciliation repairs projections;
it never repairs Mycelium from GAOT.

## Status mapping

`ACCEPTED` is the only WorkUnit state that may be presented as donor `done`.
`DRAFT`, `QUEUED`, `LEASED`, `RUNNING`, `AWAITING_REVIEW`,
`REVISION_REQUIRED`, `BLOCKED`, and `ESCALATED` are presentation mappings only
and must not invoke a donor issue lifecycle write.
