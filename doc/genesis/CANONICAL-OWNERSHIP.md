# Canonical ownership

Every Mycelium-controlled field has one canonical owner and one permitted
mutation path.

Conceptually, every exposed field follows this model:

```ts
interface FieldOwnership {
  owner: "mycelium" | "gaot" | "runtime";
  mutableThrough: "mycelium-command" | "gaot-local" | "runtime-telemetry";
}
```

| Domain | Canonical owner | GAOT role | Mutation path |
| --- | --- | --- | --- |
| company, mandate, certified roles, effective authority | Mycelium | projection | Mycelium command only |
| Intent, Plan, WorkUnit, Run | Mycelium | projection and command surface | Mycelium command only |
| Critic, Guardian, Evidence, Memory | Mycelium | projection and review surface | Mycelium command only |
| authentication, UI shell, workspaces, adapters, plugins | GAOT/Paperclip | infrastructure | GAOT-local where applicable |
| runtime telemetry and execution environment | runtime | display/index metadata | runtime telemetry path |

Projection bindings must be keyed by `(canonical_system, canonical_id,
projection_kind)` and retain a local target reference, canonical version,
source hash, observation time, and last applied event ID. Only projection
writers may update bound rows.

Paperclip issue, worker, approval, and generic patch routes are never a second
write path for a Mycelium-bound row. A donor `done` presentation status is
permitted only for an `ACCEPTED` canonical WorkUnit.
