# WanVideoWrapper Intel XPU patch bundle

- Upstream repo: https://github.com/kijai/ComfyUI-WanVideoWrapper
- Audited upstream commit: `df8f3e49daaad117cf3090cc916c83f3d001494c`
- Scope: package-level WanVideoWrapper Intel XPU migration work

## Current patch set

There are **no code patches yet** for this package case.

The current progress is still in the **baseline / audit / registration** phase:

1. local baseline checkout created
2. root requirements installed into `.venv-xpu`
3. package registration captured on Intel XPU
4. optional-gap evidence retained for `FantasyPortrait`

## Why this README exists before patches

Package migration delivery should preserve provenance and replay structure even before code deltas exist.

When Wan-specific compatibility patches are added later, record them here in order:

1. bootstrap compatibility patches
2. family-level Intel XPU enablement patches
3. test/repro or packaging-only patches

## Current caveat

Current evidence supports only:

- package registration success on Intel XPU after root dependency install
- a known optional dependency gap for `FantasyPortrait`

It does **not yet** support a repo-wide claim that all WanVideoWrapper families execute correctly on Intel XPU.

## Review summary

- package review summary: `review-summary.md`
