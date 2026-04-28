# Mixlab bootstrap hardening

## Scope

This pass hardens Mixlab package startup so the package no longer tries to mutate the Python environment during import for the currently observed bootstrap paths.

Files touched:

1. `custom_nodes/comfyui-mixlab-nodes.disabled/__init__.py`
2. `custom_nodes/comfyui-mixlab-nodes.disabled/nodes/Watcher.py`
3. `custom_nodes/comfyui-mixlab-nodes.disabled/nodes/ClipInterrogator.py`
4. `custom_nodes/comfyui-mixlab-nodes.disabled/nodes/FalVideo.py`
5. `custom_nodes/comfyui-mixlab-nodes.disabled/nodes/Lama.py`
6. `custom_nodes/comfyui-mixlab-nodes.disabled/nodes/TextGenerateNode.py`

## Behavior change

The package now prefers **explicit unavailable/runtime-error behavior** over **import-time `pip install ...` side effects** for the currently observed bootstrap paths.

That means:

1. missing `pyOpenSSL`, `watchdog`, and `openai` now produce warnings instead of import-time package mutation
2. `ClipInterrogator`, `FalVideo`, `LaMa`, and prompt-generation families no longer try to install dependencies during module import
3. `Watcher` still refuses actual folder watching if `watchdog` is missing, but package registration no longer depends on it

## Validation

Retained evidence:

1. baseline failure: `docs/artifacts/mixlab/baseline/startup-probe.json`
2. guarded Wave 1 registration success: `docs/artifacts/mixlab/wave1/startup-probe.json`
3. bootstrap-hardening startup success: `docs/artifacts/mixlab/bootstrap-hardening/startup-probe.json`

Observed result in the current environment:

1. guarded quick startup succeeds
2. default quick startup succeeds
3. `docs/artifacts/mixlab/bootstrap-hardening/startup-side-effects.jsonl` was **not created**, which means the guarded run did not record any blocked subprocess/pip side effects in this pass

## What this does not claim

This is **not** a claim that all Mixlab families are now supported.

It does **not** promote:

1. blocked families such as `Rembg`, `MiniCPM`, or `FishSpeech`
2. CPU-fallback families such as `Whisper`, `SenseVoice`, or `TripoSR`
3. XPU runtime placement for moderate-risk model families
