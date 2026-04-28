# Mixlab artifact bundle

This directory is the runtime-evidence bundle for the Mixlab Intel XPU migration package.

Mixlab is a package-level case, so artifacts here should cover shared package validation rather than a single workflow-only release.

## Expected layout

- `logs/` — install, import, startup, smoke, and blocked-case logs
- `prompts/` — saved workflow or API prompts used for validation
- `telemetry/` — XPU, memory, timing, and other retained runtime telemetry
- `generated/` — retained outputs that justify promoted success claims
- `reports/` — support-matrix updates, execution summaries, and blocked-case writeups

Keep contents concise, reproducible, and aligned with the node delivery standard.

## Local baseline checkout

- Path: `custom_nodes/comfyui-mixlab-nodes.disabled`
- Commit: `32b22c39cbe13b46df29ef1b6ab088c2eb4389d2`
- State: disabled via the `.disabled` suffix so ComfyUI will not auto-load it before probes are ready.

## Current evidence map

- `baseline/`
  - retained proof that default guarded startup still hits the original `pyOpenSSL` auto-install bootstrap blocker
- `wave1/`
  - guarded import and whitelist startup evidence after the minimal validation patch set
  - remaining side-effect noise still captured in `startup-side-effects.jsonl`
- `bootstrap-hardening/`
  - follow-up startup validation after removing the current import-time auto-install paths
  - guarded quick-start no longer emits a side-effect log in this environment
- `reports/cpu-fallback-validation.md`
  - records retained CPU-fallback evidence for `Whisper`, `SenseVoice`, and `TripoSR`
- `reports/blocked-family-triage.md`
  - reproduces the blocked reasons for `Rembg`, `MiniCPM`, and `FishSpeech`
- `reports/bootstrap-hardening.md`
  - summarizes the code deltas and the current no-side-effect startup result

Use this directory to preserve both sides of the story:

1. what fails in the untouched baseline
2. what becomes testable under guarded validation patches
3. what becomes cleaner after bootstrap hardening
4. what is still honestly blocked or fallback-only afterward
