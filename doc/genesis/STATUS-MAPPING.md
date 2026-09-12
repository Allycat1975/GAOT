# Status mapping

GAOT compatibility statuses are presentation-only. Internal Genesis code uses
canonical Mycelium states and does not mutate donor issue status to drive work.

| Mycelium WorkUnit state | GAOT compatibility presentation |
| --- | --- |
| `DRAFT` | `backlog` |
| `QUEUED` | `todo` |
| `LEASED`, `RUNNING` | `in_progress` |
| `AWAITING_REVIEW`, `REVISION_REQUIRED` | `in_review` |
| `ACCEPTED` | `done` |
| `BLOCKED`, `ESCALATED` | `blocked` |
| `CANCELLED` | `cancelled` |

`done` never means that a Run merely finished. It means that Mycelium has
recorded a Guardian-controlled canonical acceptance. A stale projection stays
readable but cannot itself authorize confirmation, dispatch, review, or other
material commands.
