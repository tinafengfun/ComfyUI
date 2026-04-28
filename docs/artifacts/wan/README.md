# WanVideoWrapper artifact bundle

This directory is the retained evidence bundle for the `ComfyUI-WanVideoWrapper` Intel XPU migration case.

Unlike the workflow-specific Dasiwa bundles, this directory is **package-level**. The goal is to preserve:

1. baseline package bootstrap behavior
2. install/import/registration evidence
3. later family-level smoke evidence
4. blocked or optional-gap evidence

## Expected layout

- `baseline/` — package bootstrap logs, `object_info`, module inventory, and install/registration summaries
- `logs/` — later family-smoke or integration logs
- `prompts/` — saved prompts or minimal graphs used for family validation
- `telemetry/` — XPU, memory, and timing captures
- `generated/` — retained outputs from promoted family smokes
- `reports/` — package execution summaries and blocked-case writeups

## Local baseline checkout

- Path: `custom_nodes/ComfyUI-WanVideoWrapper`
- Commit: `df8f3e49daaad117cf3090cc916c83f3d001494c`

## Current evidence map

- `baseline/module-inventory.tsv`
  - source-derived module inventory with node counts and coarse CUDA/XPU string hits
- `baseline/startup-probe.log`
  - pre-install baseline showing required-module failure on missing `ftfy`
- `baseline/startup-probe.json`
  - summary of the pre-install baseline checkpoint
- `baseline/startup-after-install.log`
  - post-install baseline showing successful package registration on Intel XPU
- `baseline/object_info-after-install.json`
  - retained `object_info` capture after installing root requirements
- `baseline/startup-after-install.json`
  - summary of the post-install package registration checkpoint
- `reports/core-smoke-evidence.md`
  - links retained B70 smoke outputs back to core Wan/Qwen package families

Use this directory to keep both sides of the story visible:

1. what failed in the untouched local environment
2. what became available after installing root package requirements
3. which optional families still show explicit gaps
