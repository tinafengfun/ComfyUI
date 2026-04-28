# WanVideoWrapper Intel XPU source audit

This document is the **package-level source audit** for migrating `kijai/ComfyUI-WanVideoWrapper` to Intel XPU.

It is intentionally **not** a workflow report. The unit of analysis here is the **custom-node repository** itself: registration behavior, node families, dependency posture, model expectations, and source-level CUDA bias.

## Scope

Audited upstream:

- repository: `https://github.com/kijai/ComfyUI-WanVideoWrapper`
- audited upstream commit: `df8f3e49daaad117cf3090cc916c83f3d001494c`
- local checkout path: `custom_nodes/ComfyUI-WanVideoWrapper`
- target runtime: **ComfyUI + Intel XPU**
- acceptance target: **tiered package support**, not forced all-green parity across every model family

## Why this package must be treated as a package, not a single node

`ComfyUI-WanVideoWrapper` is not just “Wan nodes”.

The package bundles:

- core Wan text/image/video generation nodes
- model-loading and sampler helpers
- cache and utility nodes
- Qwen/VLM helpers
- optional video/control extensions such as `SCAIL`, `WanMove`, `FlashVSR`, `SkyReels`, `ReCamMaster`, `HuMo`, `Mocha`, `Lynx`, `Ovi`, `MultiTalk`, `FantasyTalking`, `FantasyPortrait`, `Uni3C`, `UniAnimate`, `LongCat`, and `LongVie2`
- internal attention / fp8 / GGUF / context-window utilities

So the migration unit has to be **family-by-family**, not “one demo graph worked”.

## Package structure

The package entrypoint is `__init__.py`.

### Required modules

These are imported as **required** during plugin registration and will fail package load if they fail:

- `.nodes`
- `.nodes_sampler`
- `.nodes_model_loading`
- `.nodes_utility`
- `.cache_methods.nodes_cache`

### Optional modules

These are imported with warning-on-failure behavior:

- `.nodes_deprecated`
- `.s2v.nodes`
- `.FlashVSR.flashvsr_nodes`
- `.mocha.nodes`
- `.fun_camera.nodes`
- `.uni3c.nodes`
- `.controlnet.nodes`
- `.ATI.nodes`
- `.multitalk.nodes`
- `.recammaster.nodes`
- `.skyreels.nodes`
- `.fantasytalking.nodes`
- `.qwen.qwen`
- `.fantasyportrait.nodes`
- `.unianimate.nodes`
- `.MTV.nodes`
- `.HuMo.nodes`
- `.lynx.nodes`
- `.Ovi.nodes_ovi`
- `.steadydancer.nodes`
- `.onetoall.nodes`
- `.WanMove.nodes`
- `.SCAIL.nodes`
- `.LongCat.nodes`
- `.LongVie2.nodes`

This is a healthier bootstrap posture than Mixlab: optional families can drop out without breaking the entire package.

## Package inventory snapshot

The retained module inventory is:

- `docs/artifacts/wan/baseline/module-inventory.tsv`

Selected node-map sizes from that inventory:

| Module | Exported nodes |
| --- | ---: |
| `nodes.py` | 39 |
| `nodes_model_loading.py` | 17 |
| `nodes_utility.py` | 13 |
| `nodes_sampler.py` | 7 |
| `cache_methods/nodes_cache.py` | 3 |
| `multitalk/nodes.py` | 6 |
| `MTV/nodes.py` | 6 |
| `Ovi/nodes_ovi.py` | 6 |
| `lynx/nodes.py` | 5 |
| `fantasyportrait/nodes.py` | 4 |
| `recammaster/nodes.py` | 4 |

The bootstrap summary after installing root requirements shows **190 detected Wan-related nodes** in `object_info`:

- `docs/artifacts/wan/baseline/startup-after-install.json`

## Dependency posture

Root package requirements are moderate compared with Mixlab:

- `ftfy`
- `accelerate>=1.2.1`
- `einops`
- `diffusers>=0.33.0`
- `peft>=0.17.0`
- `sentencepiece>=0.2.0`
- `protobuf`
- `pyloudnorm`
- `gguf>=0.17.1`
- `opencv-python`
- `scipy`

Important observations:

1. **The root package was not initially install-ready in the local venv.**  
   Baseline registration first failed on missing `ftfy`.
2. **Installing `requirements.txt` was sufficient to make the package register.**  
   After that, the package loaded successfully in the Intel XPU ComfyUI runtime.
3. **Some optional families still have extra undeclared or non-root dependencies.**  
   The retained startup log shows `FantasyPortrait` failing due to missing `onnx`.

## Model and asset posture

The package readme expects these core model locations:

- text encoders in `models/text_encoders`
- clip vision in `models/clip_vision`
- main video transformer models in `models/diffusion_models`
- vae models in `models/vae`

The readme also advertises many extra model families:

- `SkyReels`
- `WanVideoFun`
- `ReCamMaster`
- `VACE`
- `ATI`
- `Uni3C`
- `FantasyTalking`
- `FantasyPortrait`
- `MultiTalk`
- `HuMo`
- `Lynx`
- `Mocha`
- `SteadyDancer`
- `One-to-All`
- `SCAIL`
- `LongCat`

That means any honest support claim must distinguish:

1. package registration
2. core Wan family execution
3. optional family execution
4. full asset-complete execution

## CUDA and NVIDIA-biased source patterns

The retained inventory highlights recurring CUDA strings in:

- `nodes_sampler.py`
- `nodes_model_loading.py`
- `Ovi/nodes_ovi.py`
- `skyreels/nodes.py`
- `fantasyportrait/nodes.py`
- `wanvideo/modules/model.py`
- `wanvideo/wan_video_vae.py`
- `WanMove/trajectory.py`
- `utils.py`

Representative risk classes:

### 1. Explicit `cuda` assumptions still exist

The inventory found non-zero CUDA-string hits in multiple core and optional modules.

This does **not** automatically mean they are unusable on XPU, because some codepaths may only activate for optional features or fallback branches. It does mean the package is **not yet device-neutral by inspection**.

### 2. No meaningful `xpu` adaptation is present in the package source

The same inventory found essentially no explicit XPU handling in the audited files.

So current Intel XPU behavior depends primarily on:

- ComfyUI core device logic
- PyTorch XPU support
- the package not hard-failing on CUDA-only branches

### 3. Attention backends are NVIDIA-oriented in optional code

The package references:

- `sageattention`
- `triton`
- flash-attention-related modules under `wanvideo/modules/attention_flash.py`

In the current Intel XPU environment:

- `sageattention` is unavailable
- ComfyUI still reports **Using pytorch attention**

So NVIDIA-specialized attention paths should be treated as **optional acceleration**, not baseline support requirements.

## Bootstrap findings

Two retained bootstrap states now exist:

### 1. Pre-install baseline

- startup reached custom-node import
- package failed on required-module dependency `ftfy`
- retained evidence:
  - `docs/artifacts/wan/baseline/startup-probe.log`
  - `docs/artifacts/wan/baseline/startup-probe.json`

### 2. Post-install baseline

After installing root requirements:

- package registration succeeded
- `object_info` captured 190 Wan-related nodes
- the current warning surface is small and explicit:
  - `sageattention` missing
  - `FantasyPortrait` optional family missing `onnx`

Retained evidence:

- `docs/artifacts/wan/baseline/startup-after-install.log`
- `docs/artifacts/wan/baseline/startup-after-install.json`
- `docs/artifacts/wan/baseline/object_info-after-install.json`

## First-pass family classification

This audit is the evidence base for the support matrix, not the final runtime verdict.

### Good baseline candidates

- core Wan generation nodes
- model-loading helpers
- utility/cache/context nodes
- Qwen helper nodes
- optional families that now register without extra work such as `WanMove`, `SCAIL`, `ReCamMaster`, `Ovi`, `Lynx`, `MultiTalk`, `HuMo`, `Mocha`, `LongCat`, and `LongVie2`

These are currently best described as **registration-success / smoke candidates**, not validated XPU feature parity.

### Explicit optional-gap family

- `FantasyPortrait`

Current gap:

- optional import warning: `No module named 'onnx'`

This is a clean package-level gap, not a vague failure.

### High-risk runtime areas

- core sampler/model-loading paths due to remaining CUDA-string hits
- optional attention/acceleration paths tied to `sageattention`, triton, or flash-specific code
- families that likely require additional proprietary or upstream model assets beyond the shared Wan core

## Practical migration conclusion

The package is in a materially better place than Mixlab for Intel XPU migration because:

1. root registration can succeed without code patching once root requirements are installed
2. optional families degrade with warnings instead of breaking package load
3. ComfyUI loads the package under `torch 2.11.0+xpu` and `Using pytorch attention`

But it is **not yet honest** to call the whole repository “migrated”.

The correct near-term status is:

- **package baseline established**
- **registration proven on Intel XPU**
- **family execution still needs targeted smoke evidence**
- **at least one optional family (`FantasyPortrait`) still has a known dependency gap**
