# Phase 01 original-remote tuning annex for DaSiWa WAN2.2

This directory is retained as the **remote isolated-checkout annex** for the same workflow now canonically delivered under:

- `../dasiwa-wan22-delivery.md`

It is no longer a standalone workflow package.

## What this annex preserves

This directory keeps the earlier remote-only evidence that is still useful for engineering review:

1. branch-level remote smoke logs and prompt snapshots
2. the branch `54` selector-fix evidence
3. the isolated performance-tuning run bundle under `perf/`
4. published PNG outputs from that earlier pass

## Read this annex only for these cases

| Need | Read |
| --- | --- |
| canonical workflow delivery / fresh deployment / GUI acceptance | `../dasiwa-wan22-delivery.md` |
| remote tuning history and benchmark finalist selection | `性能调优报告.md` and `perf/` |
| earlier remote smoke logs/prompts | `logs/` and `prompts/` |

## Relationship to the canonical workflow bundle

The following topics were merged into the canonical workflow delivery and should no longer be read here first:

1. deployment checklist
2. required patch inventory
3. custom-node compatibility summary
4. customer-facing validation steps
5. final acceptance path

Those now live in:

- `../dasiwa-wan22-delivery.md`

## Still-important retained evidence

- prompt-export fix patch: `patches/dasiwa-b70/ComfyUI-original-branch54-fix.patch`
- performance tuning summary: `性能调优报告.md`
- performance raw bundle:
  - `perf/attempts.jsonl`
  - `perf/prompts/`
  - `perf/runs/R0-Baseline/`
  - `perf/runs/P1-54-NoLowVRAM/`
  - `perf/runs/P2-54-IPEX/`
  - `perf/runs/F1-Full-IPEX/`
