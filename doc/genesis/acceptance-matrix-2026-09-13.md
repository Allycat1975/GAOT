# Genesis / Mycelium PRD acceptance evidence

This matrix records current proof without treating implementation intent as
acceptance. Production deployment is not present in this checkout. The
owner-approved evaluation-corpus waiver is recorded in
`EVAL-CORPUS-WAIVER-2026-09-13.md`.

| Gate | Current evidence | Result |
| --- | --- | --- |
| A1 | GAOT read client fails closed when Mycelium is unavailable; no command client is exposed. | Code-proven; end-to-end outage test pending |
| A2 | Canonical lifecycle tables, transactional command store, audit/outbox writes, and read API are in Mycelium. | Code-proven; deployed database pending |
| A3 | Bound issue mutation guard and child-resource guard return explicit conflict; focused guard tests exist. | Code-present; clean aggregate run pending |
| A4 | `worker-control` denies Paperclip heartbeat/self-checkout for Mycelium-controlled workers. | Focused tests pass |
| A5 | Exhaustive status mapper tests cover every canonical status; only `ACCEPTED` maps to `done`. | Focused tests pass |
| A6 | Service requires `AWAITING_REVIEW`, `SUCCEEDED` exact run, independent Critic `PASS`, and exact-run evidence; migration 000020 mirrors the gate and its raw-SQL smoke test passes. | Proven |
| A7 | Monotonic projection writer rejects stale/conflicting/re-pointed events; concrete seven-target adapter test passes. | Focused tests pass |
| A8 | Gateway tests cover absent/mismatched/expired/replayed envelopes; HMAC verifier, durable nonce store, and exact Guardian evidence adapter are implemented. | Code/typecheck proven; live Supabase integration pending |
| A9 | Active actor-to-RoleVersion resolver checks principal, tenancy, assignment interval, and active role; policy tests pass. | Proven in package tests |
| A10 | Mycelium builds/typechecks/tests and all 21 migrations pass. GAOT capability inventory uses the owner-approved official Paperclip corpus waiver; generated baseline and completeness checks pass. | Partially proven: live production flows remain |

## Runtime inputs still required

Supabase supplies `DATABASE_URL`; Ollama is reachable locally and supplies the
worker model endpoint. A deployment still has to inject `MYCELIUM_API_TOKEN`,
the API listener port, and the Ollama endpoint/model into the selected runtime.
Those values are deployment secrets/configuration, not canonical fixture data.
