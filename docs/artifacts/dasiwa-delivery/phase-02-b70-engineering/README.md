# Phase 02 B70 engineering annex for DaSiWa WAN2.2

This directory is **not** a separate workflow delivery anymore.

It is the engineering annex for the same workflow that is canonically delivered under:

- `../dasiwa-wan22-delivery.md`

Use this directory only when you need the preserved B70-side engineering evidence behind that workflow delivery.

## What is unique here

The files in this directory keep evidence that is still useful but too detailed for the main delivery note:

1. branch-level smoke prompts/logs/media under `prompts/`, `logs/`, and `generated/`
2. full-size failure evidence under `logs/`, `telemetry/`, and `subquad-experiment/`
3. B70-specific engineering analyses such as:
   - `显存分析.md`
   - `comfy 功能分析和xpu差距.md`
   - `完整测试报告.md`
   - `端到端测试执行复现指南.md`

## What is no longer primary here

The following topics are now maintained in the canonical delivery bundle instead of being treated as standalone B70-package content:

1. fresh deployment checklist
2. required custom-node patch list
3. Intel-safe workflow overrides
4. GUI manual validation steps
5. final customer acceptance path

For those, always read:

- `../dasiwa-wan22-delivery.md`
