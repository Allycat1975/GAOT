# GAOT donor-state ownership inventory

This is the implementation authority for state ownership in the Genesis fork.
`P` means Paperclip-owned infrastructure, `M` means Mycelium-canonical state,
`G` means Genesis-native GAOT state, and `D` means deprecated for MYCI.

| Donor domain / route family | Owner | Fork disposition | Rule |
|---|---:|---|---|
| authentication, memberships, instance settings | P | keep | GAOT operator access remains local to GAOT. |
| companies and company routes | M | wrap | render a Mycelium projection; canonical mutation goes through `MyceliumCommandPort`. |
| agents, org chart, worker detail | M | wrap | Paperclip agent rows are read models; Role Factory owns role authority. |
| goals and project-goal links | M | wrap | preserve the donor tree UI, not donor mutation authority. |
| issues, comments, issue status | M | replace as authority | render WorkUnits; only `ACCEPTED` maps to donor `done`. |
| heartbeat runs and run logs | M | wrap | run presentation is retained; heartbeat scheduling cannot dispatch MYCI work. |
| approvals and decision queue | M | replace as authority | Guardian verdict is canonical; donor approval is never sufficient. |
| activity and cost events | M | wrap | Mycelium event/cost feeds are projected for the donor UI. |
| work products and attachments | M | wrap | evidence is canonical; GAOT stores display/index metadata only. |
| routines, triggers, concurrency | P/G | adapt | triggers create Intents or pre-authorised Plans, never donor Issues for MYCI. |
| workspaces, environments, runtime services | P | keep | execution infrastructure only; Mycelium selects the WorkUnit and authority. |
| adapters and adapter utilities | P | keep | invoked exclusively by the Mycelium dispatch path. |
| skill studio and catalog | P/G | adapt | keep editing/testing UX; Role Factory controls assignment and effective authority. |
| plugins and plugin UI slots | P | keep/restrict | plugins cannot override Constitution, Tool Gateway, or Guardian controls. |
| secrets and environment bindings | P/G | restrict | runtime-provider secrets may remain; business secrets resolve only inside Tool Gateway. |
| portability and CLI | P/G | defer/adapt | no raw secrets; Genesis manifest includes Constitution and Role versions. |

## Projection binding requirements

Each projected entity must have a binding keyed by `(canonical_system,
canonical_id, projection_kind)`, with a unique local target reference, canonical
version, source hash, observation time, and last applied event ID. Projection
writers are the only code allowed to update those local targets. Native donor
repositories and generic patch routes must reject mutations to bound rows.

## Command safety

Commands are live server-side Mycelium calls. A GAOT projection may display
`STALE`, but cannot be used alone to confirm, dispatch, approve, or accept a
material action. On a command failure GAOT must not optimistically write a
success state; it waits for canonical acknowledgement and projection update.
