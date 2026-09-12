# Genesis GAOT delivery gates

This checklist converts the fork specification into verifiable delivery gates.
No later gate may weaken an earlier invariant.

| Gate | Required result | Evidence |
|---|---|---|
| 0 — provenance | MIT notice retained; `origin`, `upstream`, and pristine `paperclip-upstream` exist | `git remote -v`, branch SHA, `LICENSE` |
| 1 — seam | contracts, ownership inventory, and projection protocol exist without donor runtime change | `packages/mycelium-contracts`, Genesis docs, donor test baseline |
| 2 — read model | Mycelium company, workers, goals, WorkUnits, runs, costs, and activity render read-only | projection route/UI tests; stale marker |
| 3 — intent | Tell MYCI produces canonical Intent previews and confirmation | command-port integration tests |
| 4 — planning | confirmed Plans produce bounded WorkUnit DAGs | Plan version/DAG and authority tests |
| 5 — execution | selected WorkUnit runs via donor adapter, without heartbeat self-selection | adapter dispatch tests |
| 6 — review | independent Critic then explicit Guardian verdict controls acceptance | self-acceptance denial tests |
| 7 — evidence | accepted Evidence is immutable/provenanced and only then memory-eligible | evidence/memory provenance tests |
| 8 — tools | Tool Gateway verifies Mycelium authorisation envelope | missing/expired/hash/wrong-unit/replay tests |
| 9 — routines and skills | routines create Intents; Role Factory owns assignments | no-direct-issue and authority tests |
| 10 — production alpha | all GAOT core views and governed command flows work against live Mycelium | e2e flows and reconciliation checks |

## Required negative tests

- A Paperclip issue patch cannot accept a WorkUnit.
- A Paperclip worker edit cannot change certified Role authority.
- A heartbeat cannot dispatch a Mycelium WorkUnit.
- A donor approval cannot substitute for Guardian acceptance.
- A stale projection cannot approve or execute a material operation.
- Projection reconciliation never mutates Mycelium.
- A worker cannot accept its own output.
- Missing, expired, hash-mismatched, wrong-WorkUnit, and replayed tool envelopes fail closed.

## Status presentation mapping

| Mycelium state | GAOT presentation | Donor mutation allowed |
|---|---|---|
| DRAFT / QUEUED | planned work | no |
| LEASED / RUNNING | in progress | no |
| AWAITING_REVIEW | awaiting Critic/Guardian | no |
| REVISION_REQUIRED | revision required | no |
| BLOCKED / ESCALATED | blocked / needs Guardian | no |
| ACCEPTED | completed | no; projection writer only |
| CANCELLED | cancelled | no; projection writer only |
