# Mixlab XPU patch bundle

- Upstream repo: https://github.com/shadowcz007/comfyui-mixlab-nodes
- Audited upstream commit: `32b22c39cbe13b46df29ef1b6ab088c2eb4389d2`
- Scope: package-level Mixlab Intel XPU migration patches

## Expected patch order

1. baseline compatibility or packaging patches
2. family-level Intel XPU enablement patches
3. family-specific test or repro patches
4. follow-up cleanup patches only if they are required for replay

## Current patch set

1. `0001-guarded-bootstrap-validation.patch`
   - adds guarded bootstrap behavior to `__init__.py` so validation probes can record missing dependencies without import-time auto-installs
   - normalizes `utils` package resolution for isolated import probes
   - skips route registration when `PromptServer.instance` is unavailable during isolated imports
   - defers `watchdog` failure in `nodes/Watcher.py` until folder watching is explicitly enabled
   - removes the current import-time auto-install paths from `ClipInterrogator`, `FalVideo`, `Lama`, and `TextGenerateNode`
   - converts those families to explicit unavailable/runtime-error behavior until their dependencies are installed deliberately
   - lets `TripoSR` prefer a staged local DINO `config.json` before falling back to Hugging Face download

## Current caveat

This patch is a **validation-enablement patch**, not a claim that Mixlab's default bootstrap path is clean on Intel systems.

Baseline evidence still shows:

1. default startup tries to auto-install `pyOpenSSL`
2. CPU-fallback families still require explicit dependency and model-asset preparation
3. blocked families still need family-level work; bootstrap hardening does not promote them automatically

## Review summary

- package review summary: `review-summary.md`
