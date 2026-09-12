# Genesis delivery audit

Date: 2026-09-12

This is the execution and verification ledger for GEN-FORK-001. It does not
replace the Genesis boundary documents; they remain normative.

## Current proven foundation

| Requirement | Current evidence | Delivery state |
| --- | --- | --- |
| Preserve Paperclip provenance and upstream mergeability | `UPSTREAM.md`, `THIRD_PARTY_NOTICES.md`, `paperclip-upstream` branch | established |
| State and governance boundary | `doc/genesis/*.md` ownership, status, Guardian, and merge documents | established |
| Typed, read-only Mycelium seam | `server/src/mycelium/client.ts`, projection routes, canonical Mycelium API | established |
| Canonical control-plane storage | MyCI migrations `000015` and `000016` | established |
| Presentation branding | GAOT brand configuration and manifest/title | established |
| Binding registry | `genesis_projection_bindings` migration `0274` | established, not yet wired to all donor mutations |

## Mandatory delivery gates

### Gate A — Canonical commands

Mycelium, not GAOT, must provide a policy-authorized command path for Intent,
Plan confirmation, WorkUnit dispatch, Critic/Guardian review, Evidence and
Memory. Each command must emit an audit/domain event and fail closed when live
canonical authority cannot be resolved. GAOT must never expose a generic
canonical PATCH or POST endpoint.

Proof: command-service tests cover deny, allow, tenancy, idempotency and the
Guardian/evidence invariants; a live endpoint has no general mutation route.

### Gate B — Projection writer and mutation guard

The only process allowed to update a Mycelium-bound GAOT target is the
projection writer. The binding registry must be consulted by every generic
issue/agent/approval/goal mutation path, not merely by a new route. A binding
records canonical system/id/kind, local target, version/hash, observation time
and last applied event ID. Event application must be idempotent and reject an
older canonical version.

Proof: attempts to patch a bound row through all donor entry points fail;
replay and out-of-order event tests leave the newest canonical projection
intact.

### Gate C — Lifecycle mapping

Map Mycelium `WorkUnitStatus` to a presentation-only GAOT status. `done` is
possible exclusively for canonical `ACCEPTED`; a successful or completed Run
is never sufficient. Paperclip approval records remain UI/workflow metadata,
not Guardian acceptance.

Proof: exhaustive mapper test and route test for every canonical state,
including run success without Guardian acceptance.

### Gate D — Dispatch and execution safety

Every MYCI worker is marked `controlPlane = MYCELIUM`. Donor heartbeat,
self-checkout and issue-claim paths must reject these workers. Dispatch must
derive a Mycelium lease, role version, authority manifest and output contract;
Paperclip execution infrastructure may host the run only after that dispatch.

Proof: integration test shows a heartbeat/self-claim receives an explicit
denial and a dispatched run cannot execute without its canonical lease.

### Gate E — Tool, secret and plugin boundary

Consequential tool calls require a valid Mycelium authorization envelope
(work unit, run, capability, risk, payload hash, expiry, nonce and signature).
Business credentials are reachable only through the Tool Gateway. Plugins and
donor routes cannot accept work, grant authority, create accepted evidence or
write memory.

Proof: envelope replay/expiry/payload/R3 denial tests; secret-purpose and
plugin-capability negative tests.

### Gate F — Operator experience

GAOT renders actual canonical Company, Worker, Goal, WorkUnit, Run, Evidence,
Activity and Cost data. It must show `STALE`/unavailable canonical state rather
than seeded or donor fallback data, and command controls only call the governed
Mycelium command surface.

Proof: UI integration tests for data, stale, unavailable and rejected-command
states; production route responses contain no fixture records.

## Explicitly prohibited shortcuts

- No GAOT-to-Mycelium writeback during reconciliation or repair.
- No local issue checkout or heartbeat scheduling for a MYCI WorkUnit.
- No mapping from completed Run to `done`, and no donor approval treated as
  Guardian acceptance.
- No donor role/agent route edits to certified authority, capability or budget
  power.
- No business-system secret injection to general agent environments.
- No plugin governance override, no live demo data, and no mass package rename
  before the seam is stable.

## Completion test

The fork is production-ready only when turning off Mycelium leaves GAOT able to
show last-known state but unable to authoritatively command or execute MYCI
work; turning off GAOT leaves Mycelium’s canonical history and governance
intact.
