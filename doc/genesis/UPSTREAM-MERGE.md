# Upstream merge guide

The stable upstream comparison branch is `paperclip-upstream`; Genesis work is
integrated through `genesis/main` and short-lived `genesis/*` branches. Keep
Genesis changes concentrated in `doc/genesis`, `server/src/genesis`,
`server/src/mycelium`, `packages/mycelium-contracts`,
`packages/genesis-view-models`, and small explicit donor seams.

Before accepting an upstream change, classify it:

- normally adopt: design system, responsive UI, adapters, workspaces, plugins,
  cost instrumentation, security, authentication, and performance;
- review at the seam: companies, workers, goals, issues, heartbeats,
  approvals, routines, and task state; or
- reject or adapt: any change that makes a Paperclip-derived row authoritative
  for MYCI work, authority, governance, Evidence, or Memory.

Never resolve a merge conflict by restoring donor authority over a
Mycelium-controlled entity. Retain MIT attribution and update [UPSTREAM.md]
(../../UPSTREAM.md) whenever the adopted donor baseline changes.
