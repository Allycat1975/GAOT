# Mycelium seam

GAOT is a Paperclip-derived operator shell and execution-host infrastructure.
Mycelium is the canonical control plane for MYCI companies. The only boundary
between them is the typed `@genesis/mycelium-contracts` package.

## Direction of authority

```text
Mycelium canonical state -> GAOT projection -> Paperclip-derived views
GAOT operator command -> MyceliumCommandPort -> canonical acknowledgement
```

Projection traffic is one-way. Reconciliation may repair a GAOT projection;
it must never repair or infer canonical Mycelium state. A failed command never
causes an optimistic local success write.

## Projection writer integration

`server/src/mycelium/projection-writer.ts` is the sole GAOT-side projection
write primitive. An event consumer first uses it to reconcile the canonical
record into its explicitly named GAOT presentation target, then advances the
`genesis_projection_bindings` metadata only after that target write succeeds.
Target adapters that update a GAOT database record must provide a transaction
when the target write and binding metadata need all-or-nothing persistence.
The writer rejects a re-pointed binding, conflicting equal versions, and lower
versions before any target write.

The target-specific adapter must call `assertGaotMutationAllowed` from
`projection-guard.ts` in every ordinary donor mutation route/service before it
updates an issue, agent, or other bindable target. The projection adapter is
the only exception: it invokes the target-local writer through the projection
writer, never a Mycelium command port. This integration is intentionally
explicit until each donor mutation surface has been covered.

## Ports

The bridge is deliberately split into:

- `MyceliumReadPort` for canonical read models;
- `MyceliumCommandPort` for explicitly governed canonical commands;
- `MyceliumEventPort` for idempotent projection updates; and
- `MyceliumHealthPort` for live, degraded, and offline presentation.

No generic Paperclip repository, route, plugin, heartbeat, routine, or adapter
may write canonical MYCI state. Runtime behaviour is not connected by this
foundational commit; a live client and projection writer require separate,
tested delivery gates.
