# A10 evaluation-corpus waiver — 2026-09-13

## Decision

The owner approved substituting the unavailable private
`paperclip-evals/paperclip-skill-optimization` corpus with the official
Paperclip Promptfoo suites shipped in this fork.

This is an explicit A10 acceptance waiver, not a claim that the private corpus
was recovered or that the two corpora are equivalent.

## Substituted source

- Source: `evals/promptfoo/tests/*.yaml`
- Upstream: <https://github.com/paperclipai/paperclip/tree/master/evals/promptfoo/tests>
- Files: `core.yaml`, `governance.yaml`, `mcp-gateway.yaml`,
  `phase5-memory-control-surfaces.yaml`, `release-gates.yaml`
- Inventory rows: 29 concrete Promptfoo cases
- Upstream README grouping: 23 behavioral cases

## Verifier behavior

`packages/paperclip-runner/scripts/generate-capability-inventory.mjs` uses the
private corpus when `PAPERCLIP_EVALS_ROOT` is supplied or discoverable. When it
is absent, it uses the committed official suites and records
`sourceProfile: official-paperclip-owner-waiver` in the generated inventory.
The generated inventory validator expects 29 rows for this explicitly named
profile; the original 106-case expectation remains unchanged for the private
corpus profile.

No fixture corpus was fabricated, and no private-corpus pass is claimed.
