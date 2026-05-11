# Memory checklist (legacy appendix)

The old standalone memory checklist has been merged into:

- `migration_checklist.md` — **canonical reusable migration + capacity triage checklist**

Use this file only as a short pointer when older docs still mention `memory_checklist.md`.

## Use these instead

| Need | Read |
| --- | --- |
| reusable capacity / stop-patching rules | `migration_checklist.md` |
| workflow-specific full-size OOM example | `dasiwa-b60-fullsize-oom-report.md` |
| optimization ideas after functional correctness | `intel-xpu-optimization-research.md` |

## Quick reminder

If both are true:

1. runtime logs show `free + required > total budget`
2. theoretical active-weight plus activation peak also exceeds the budget

then treat the result as a **capacity hard stop**, not a normal tuning failure.
