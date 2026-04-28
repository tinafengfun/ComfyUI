# WanVideoWrapper Intel XPU support matrix

This matrix summarizes the current **package-level Intel XPU posture** for `kijai/ComfyUI-WanVideoWrapper`.

It combines:

- source audit
- bootstrap evidence
- package registration evidence
- dependency-gap evidence

It does **not** claim full runtime parity for every optional model family.

## Scope

- package: `custom_nodes/ComfyUI-WanVideoWrapper`
- upstream commit: `df8f3e49daaad117cf3090cc916c83f3d001494c`
- local runtime: **ComfyUI 0.19.3 + torch 2.11.0+xpu**

## Status legend

| Status | Meaning |
| --- | --- |
| `smoke-backed` | representative nodes from this family completed with retained runtime evidence on Intel XPU, but the entire family is not yet proven feature-complete |
| `registration-success` | family or package registered successfully on Intel XPU, but no representative runtime smoke has been retained yet |
| `smoke-candidate` | source and bootstrap evidence suggest this family is a good next target for representative XPU smoke validation |
| `optional-gap` | family is optional and currently missing a known extra dependency or asset |
| `blocked` | strong evidence says the family is currently unsupported or too CUDA/NVIDIA-specific for baseline delivery |
| `not-assessed` | no representative family execution has been retained yet |

## Current bootstrap checkpoint

Current retained states:

| Checkpoint | Result | Evidence |
| --- | --- | --- |
| pre-install baseline | required-module import failed on missing `ftfy` | `docs/artifacts/wan/baseline/startup-probe.log` |
| post-install baseline | package registration succeeded on Intel XPU | `docs/artifacts/wan/baseline/startup-after-install.log` |
| post-install node surface | 190 Wan-related nodes present in `object_info` | `docs/artifacts/wan/baseline/startup-after-install.json` |

Current warning surface after root requirements install:

- `sageattention` unavailable
- `FantasyPortrait` optional family unavailable because `onnx` is missing

## Package-level posture summary

| Question | Current answer |
| --- | --- |
| Does the package load on Intel XPU after root dependency install? | **Yes** |
| Do required modules register? | **Yes** |
| Do optional family failures crash the package? | **No** |
| Are all families runtime-validated on Intel XPU? | **No** |
| Are there known optional gaps already captured? | **Yes** |

## Family matrix

| Family | Representative modules / nodes | Status | Notes |
| --- | --- | --- | --- |
| Core Wan generation | `nodes.py`, `nodes_sampler.py`, nodes such as `WanImageToVideo`, `WanFirstLastFrameToVideo`, `WanMultiFrameRefToVideo` | `smoke-backed` | representative core runtime nodes already completed via retained B70 smoke evidence; see `docs/artifacts/wan/reports/core-smoke-evidence.md` |
| Model loading | `nodes_model_loading.py`, nodes such as `LoadWanVideoClipTextEncoder`, `LoadWanVideoT5TextEncoder` | `registration-success` | core loaders register on Intel XPU runtime |
| Utility / cache / compile helpers | `nodes_utility.py`, `cache_methods/nodes_cache.py`, `TorchCompileModelWanVideo*` | `registration-success` | registration proven; runtime semantics still need targeted checks |
| Qwen helpers | `qwen/qwen.py`, `Qwen3_VQA`, `QwenLoader`, `TextImageEncodeQwenVL` | `smoke-backed` | `Qwen3_VQA` is part of the retained successful B70 smoke workflow evidence |
| Context / memory / block controls | context windows, block swap, cache helpers | `smoke-candidate` | promising next Wave 1 area because registration succeeded and value is high for Intel VRAM constraints |
| WanMove | `WanMove/nodes.py` | `registration-success` | family registered; some helper code still contains CUDA strings, so runtime should be tested before promotion |
| SCAIL | `SCAIL/nodes.py`, `WanSCAILToVideo` | `registration-success` | registers successfully; full-size workflow OOM history does not equal package-family validation |
| ReCamMaster | `recammaster/nodes.py` | `registration-success` | family registered; model and runtime behavior still unverified |
| Ovi | `Ovi/nodes_ovi.py` | `registration-success` | registers, but source still contains CUDA strings; treat as unvalidated runtime |
| Lynx | `lynx/nodes.py` | `registration-success` | registers; face encoder helpers still show CUDA strings |
| MultiTalk | `multitalk/nodes.py` | `registration-success` | registers on current baseline |
| HuMo | `HuMo/nodes.py` | `registration-success` | registers on current baseline |
| Mocha | `mocha/nodes.py` | `registration-success` | registers on current baseline |
| FlashVSR | `FlashVSR/flashvsr_nodes.py` | `registration-success` | registers; backend-specific acceleration assumptions still need smoke evidence |
| LongCat / LongVie2 | `LongCat/nodes.py`, `LongVie2/nodes.py` | `registration-success` | registers; runtime support not yet exercised |
| Uni3C / UniAnimate / OneToAll / SteadyDancer / MTV | optional nodes under their package folders | `registration-success` | optional modules loaded in current package baseline; no retained family-level smoke yet |
| FantasyTalking | `fantasytalking/nodes.py` | `registration-success` | family registers; no smoke evidence yet |
| FantasyPortrait | `fantasyportrait/nodes.py` | `optional-gap` | current startup warning: `No module named 'onnx'`; family not present until extra dependency is installed |
| NVIDIA-only acceleration extras | `sageattention`, flash/triton-side acceleration paths | `blocked` | baseline Intel XPU package load does not require them, but they are unavailable in the current environment |

## What is proven vs not proven

### Proven now

1. the package can be checked out locally
2. the root requirements can be installed into `.venv-xpu`
3. ComfyUI can start on Intel XPU with the package enabled
4. required Wan modules register
5. optional failures degrade to warnings instead of breaking package load
6. representative core Wan and Qwen nodes have retained smoke evidence through the B70 package-using workflow case

### Not proven yet

1. that every core Wan generation subpath has standalone package-level smoke coverage outside the retained B70 workflow evidence
2. that model-loading families work end-to-end with staged models in this environment
3. that optional families like `Ovi`, `Lynx`, `ReCamMaster`, or `SkyReels` complete on Intel XPU
4. that CUDA-string-bearing code paths are all neutralized by current runtime behavior

## Safe next migration direction

Promote in this order:

1. **core loader + utility smoke**
2. **small core Wan generation smoke**
3. **Qwen helper smoke**
4. **one or two optional families with low extra dependency cost**

Delay until explicitly needed:

1. `FantasyPortrait` until `onnx` dependency handling is made deliberate
2. NVIDIA-only acceleration paths such as `sageattention`
3. optional families that need substantial extra assets before a small XPU smoke is even meaningful
