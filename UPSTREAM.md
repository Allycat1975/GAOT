# Upstream provenance and merge policy

This repository is the Genesis Holdings fork of Paperclip.

| Item | Value |
| --- | --- |
| Fork remote | `origin` — `https://github.com/Allycat1975/gaot.git` |
| Donor remote | `upstream` — `https://github.com/paperclipai/paperclip.git` |
| Genesis baseline | Paperclip `v2026.831.0` |
| Baseline commit | `dbf052577d073bdac511d796e763c0bbd0bd9bab` |
| Pristine comparison branch | `paperclip-upstream` |

Keep `paperclip-upstream` pointing at the unmodified donor baseline. Genesis
work belongs on `genesis/*` branches; the integration branch is
`genesis/main`. Before an upstream merge, review changes to issues, heartbeats,
approvals, workers, and governance against the Genesis boundary documents.

Prefer upstream changes to generic UI, authentication, adapters, workspaces,
plugins, costs, security, and performance. Reject or adapt changes that make
donor issue, heartbeat, approval, or agent state authoritative for a
MYCI-controlled company.
