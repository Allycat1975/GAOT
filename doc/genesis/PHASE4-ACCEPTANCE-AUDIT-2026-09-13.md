# Genesis/Paperclip Phase 4 acceptance audit

This is local implementation evidence, not production sign-off. The PRD
prohibits push/deploy/production mutation/credential creation without separate
owner approval.

| Gate | Current evidence | Status |
|---|---|---|
| A1/A2 | Read-only projection facade and canonical command/history are separate | Live failover rehearsal pending |
| A3 | Central donor guard plus issue route/service guards; `issue`, `work_unit`, and `work-unit` aliases covered | Local pass; live bound-target rehearsal pending |
| A4 | Mycelium worker control gates claim, checkout, heartbeat and scheduling | Local code evidence; live rehearsal pending |
| A5/A6 | Mycelium service requires independent Critic PASS and exact Guardian run evidence | 18 control-plane tests pass; live rehearsal pending |
| A7 | Projection writer rejects stale, replayed, conflicting and re-pointed bindings | Focused projection tests pass; distributed concurrency not rehearsed |
| A8 | HMAC envelope, expiry, nonce replay protection and exact Guardian evidence | 15 Tool Gateway tests pass; live credential-order rehearsal pending |
| A9 | Supabase JWT maps to active HUMAN actor and Postgres RoleVersion context | 5 API + resolver/policy tests pass; live Auth rehearsal pending |
| A10 | 21 migration/RLS/raw-SQL checks, API/control/tool tests pass | GAOT full gate awaits external `paperclip-evals` corpus; Windows embedded-Postgres test times out |

## Verified commands

- `pnpm db:validate`: 21 migrations, RLS smoke and Guardian raw-SQL guard all OK.
- `pnpm --filter @genesis/mycelium-api test`: 5/5.
- `pnpm --filter @genesis/mycelium-control-plane test`: 18/18.
- `pnpm --filter @genesis/tool-gateway test`: 15/15.
- GAOT focused projection/ingress/mutation tests: 6/6.

## External completion inputs

Production completion requires the real Supabase database password/JWT secret,
service token and deployment environment, explicit migration approval, live
A1–A9 rehearsals, and the vendor `paperclip-evals/paperclip-skill-optimization`
corpus. No fixtures or substitute corpus may be used.
