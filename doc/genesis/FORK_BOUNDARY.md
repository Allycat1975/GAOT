# Genesis GAOT fork boundary

GAOT is a Paperclip-derived presentation and operator shell. Mycelium is the
canonical Genesis control plane. GAOT connects to it only through
`@genesis/mycelium-contracts`.

This fork retains Paperclip's MIT licence and upstream provenance. Its intended
baseline is Paperclip `v2026.831.0` (`dbf052577d073bdac511d796e763c0bbd0bd9bab`).

| Domain | Canonical owner | GAOT role |
|---|---|---|
| company, roles, authority, goals | Mycelium | read projection |
| Intent, Plan, WorkUnit, Run | Mycelium | command/view adapter |
| Critic, Guardian, Evidence, Memory | Mycelium | command/view adapter |
| shell, workspaces, adapters, skills, routines, costs | GAOT/Paperclip | retained infrastructure |

## Invariants

1. Donor data is a projection, never a second source of truth.
2. Only `MyceliumCommandPort` can mutate canonical Genesis state.
3. A completed Run is not accepted work; only a Guardian verdict may accept it.
4. Mycelium workers receive explicit WorkUnits and cannot self-select work.
5. Paperclip heartbeat processing cannot dispatch Mycelium work.
6. Paperclip approval cannot substitute for Guardian acceptance.
7. Business credentials remain behind the Tool Gateway.
8. A stale projection is readable but cannot approve or execute a material command.

## Projection protocol

Every projection records canonical ID, version, source hash, and observation
time. Events are applied idempotently in one direction only:
`MYCELIUM -> GAOT`. Reconciliation repairs projections; it never repairs
Mycelium from GAOT state. `ACCEPTED` is the only WorkUnit state that can map to
donor `done`.
