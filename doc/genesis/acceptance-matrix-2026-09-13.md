# Genesis / Mycelium PRD acceptance evidence

This matrix records current proof without treating implementation intent as
acceptance. Production deployment is not present in this checkout. The
owner-approved evaluation-corpus waiver is recorded in
`EVAL-CORPUS-WAIVER-2026-09-13.md`.

| Gate | Current evidence | Result |
| --- | --- | --- |
| A1 | GAOT read client fails closed and serves binding-scoped last-known projections when Mycelium is unavailable, including connection refusal; no command client is exposed. | Code-proven; end-to-end outage test pending |
| A2 | Canonical lifecycle tables, transactional command store, audit/outbox writes, and read API are in Mycelium. | Code-proven; deployed database pending |
| A3 | Bound issue mutation guard and child-resource guard return explicit conflict; focused guard tests exist. | Code-present; embedded-Postgres issue-guard suite times out on this Windows host; live bound-target rehearsal pending |
| A4 | `worker-control` denies Paperclip heartbeat/self-checkout for Mycelium-controlled workers. | Focused pure tests pass; live heartbeat/claim/checkout rehearsal pending |
| A5 | Exhaustive status mapper tests cover every canonical status; only `ACCEPTED` maps to `done`. | Focused tests pass |
| A6 | Service requires `AWAITING_REVIEW`, `SUCCEEDED` exact run, independent Critic `PASS`, and exact-run evidence; migration 000020 mirrors the gate and its raw-SQL smoke test passes. | Local/code proven; exact-run live rehearsal pending |
| A7 | Monotonic projection writer rejects stale/conflicting/re-pointed events; concrete eight-target adapter test passes (company, worker, goal, WorkUnit, run, activity, evidence, cost). | Focused tests pass; distributed concurrency and live monotonicity rehearsal pending |
| A8 | Gateway tests cover absent/mismatched/expired/replayed envelopes; HMAC verifier, durable nonce store, and exact Guardian evidence adapter are implemented. | Code/typecheck proven; live Supabase integration pending |
| A9 | Active actor-to-RoleVersion resolver checks principal, tenancy, assignment interval, and active role; managed ES256 JWKS authentication and governed intent authority were exercised against Supabase. | Live pass: positive HTTP `201`; five negative cases HTTP `403`; counts unchanged for negative cases |
| A10 | Mycelium builds/typechecks/tests and all 21 migrations pass. GAOT capability inventory uses the owner-approved official Paperclip corpus waiver; generated baseline and completeness checks pass. | Partially proven: live production flows remain |

## Runtime inputs still required

Supabase supplies the production database and JWKS endpoint; Ollama supplies the
worker model endpoint locally. A deployment still has to inject the actor/runtime
token, API listener port, and Ollama endpoint/model into the selected runtime.
Those values are deployment secrets/configuration, not canonical fixture data.
