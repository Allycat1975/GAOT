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
