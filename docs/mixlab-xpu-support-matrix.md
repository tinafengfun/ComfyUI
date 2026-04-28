# Mixlab Intel XPU support matrix

This matrix summarizes the **first-pass source-audited Intel XPU posture** for `MixLabPro/comfyui-mixlab-nodes`.

This is a **package-level** support matrix.

It is based on:

- upstream source audit
- dependency inventory
- import-time behavior review
- CUDA/NVIDIA assumption review

It is **not yet** a runtime validation report.

## Target boundary

- **ComfyUI custom-node package**
- **Intel XPU migration**
- **tiered support allowed**
- package-wide all-green support is **not required** for acceptance

## Status legend

| Status | Meaning |
| --- | --- |
| `xpu-candidate` | source audit suggests the family may be supportable on Intel XPU after cleanup and testing |
| `cpu-fallback` | the family looks more realistic as explicit CPU support than as early XPU support |
| `optional-disabled` | the family should likely be disabled on Intel builds until better support exists |
| `blocked` | strong evidence that the family is currently too CUDA/NVIDIA-specific or high-effort for baseline support |
| `not-assessed` | not enough source or runtime evidence yet |
| `xpu-na` | the family is mainly API/service orchestration where Intel XPU is not the meaningful success axis |

## Current posture summary

The repo is not a single migration target. It is a **bundle of families with different support shapes**:

- some families look like straightforward utility-node migrations
- some families should be honest **CPU fallback**
- some families are primarily **service-backed**
- some families are **blocked** by CUDA-heavy assumptions

## Local validation checkpoint

The current local repo now has **three** retained bootstrap states:

- baseline guarded startup reproduces the original blocked bootstrap behavior because `__init__.py` tries to auto-install `pyOpenSSL`
- the guarded Wave 1 patch lets isolated import and whitelist startup succeed for validation probes
- the follow-up bootstrap-hardening patch removes the current import-time auto-install noise for `pyOpenSSL`, `watchdog`, `openai`, `clip-interrogator`, `fal-client`, `simple_lama_inpainting`, and `sentencepiece`, so both guarded and default quick startup succeed in the current environment

Key evidence:

- baseline failure: `docs/artifacts/mixlab/baseline/startup-probe.json`
- guarded import success: `docs/artifacts/mixlab/wave1/import-probe.json`
- guarded startup success: `docs/artifacts/mixlab/wave1/startup-probe.json`
- bootstrap hardening report: `docs/artifacts/mixlab/reports/bootstrap-hardening.md`
- CPU-fallback validation report: `docs/artifacts/mixlab/reports/cpu-fallback-validation.md`
- blocked-family detail: `docs/artifacts/mixlab/reports/blocked-family-triage.md`

`Whisper`, `SenseVoice`, and `TripoSR` are now **locally CPU-fallback validated** in this repo snapshot. That does **not** promote them to XPU-native support; it only confirms they have an explicit CPU path with retained evidence.

## Core utility and image matrix

| Family | Representative nodes | Status | Notes |
| --- | --- | --- | --- |
| Prompt helpers | `RandomPrompt`, `EmbeddingPrompt`, `PromptSlide`, `GLIGENTextBoxApply_Advanced` | `xpu-candidate` | mostly package/UI logic; low evidence of hard device binding in the first source pass |
| Input/output/UI | `GridInput`, `ImagesPrompt_`, `KeyInput`, `TextInput_`, `SaveImageToLocal`, `CreateJsonNode` | `xpu-candidate` | mostly I/O and packaging logic rather than device-defined compute |
| Image/color/layer/mask | `ResizeImageMixlab`, `EnhanceImage`, `Image3D`, `ImageColorTransfer`, `ShowLayer`, `MergeLayers`, `FaceToMask`, `OutlineMask` | `xpu-candidate` | good Wave 1 candidates; should still be validated by family smoke |
| Screen and utility glue | `ScreenShare`, `FloatingVideo`, `MultiplicationNode`, style/helper nodes | `xpu-candidate` | mostly framework glue; low CUDA pressure in the source pass |
| P5 | `P5Input` | `xpu-candidate` | frontend/input style feature, not meaningful XPU compute by itself |

## Service-backed and orchestration matrix

| Family | Representative nodes | Status | Notes |
| --- | --- | --- | --- |
| OpenAI / cloud LLM | `ChatGPTOpenAI`, `SiliconflowLLM` | `xpu-na` | correctness depends more on service contract than on XPU device placement |
| Cloud image/video APIs | `SiliconflowTextToImageNode`, `VideoGenKlingNode`, `VideoGenRunwayGen3Node`, `VideoGenLumaDreamMachineNode` | `xpu-na` | external-service clients; should be tested for install/import/service behavior, not XPU kernels |
| Video plumbing | `VideoCombine_Adv`, `LoadVideoAndSegment_`, `GenerateFramesByCount` | `xpu-candidate` | likely ffmpeg/OpenCV-oriented; still needs registration and smoke checks |

## Moderate-risk model families

| Family | Representative nodes | Status | Notes |
| --- | --- | --- | --- |
| ClipInterrogator | `ClipInterrogator` | `xpu-candidate` | current code uses `cuda/cpu` branching; likely recoverable with device cleanup |
| Prompt generation / text generation | `PromptGenerate_Mix`, `ChinesePrompt_Mix`, related text nodes | `xpu-candidate` | moderate device cleanup candidate; should not be claimed until family smoke exists |
| LaMa / image inpaint helpers | `LaMa` family | `xpu-candidate` | moderate cleanup target; likely good after generic placement fixes |

## CPU-fallback-first families

| Family | Representative nodes | Status | Notes |
| --- | --- | --- | --- |
| Whisper | `LoadWhisperModel_`, `WhisperTranscribe_` | `cpu-fallback` | locally validated on CPU with `faster-whisper-tiny`; fallback support only |
| SenseVoice | `SenseVoiceNode` | `cpu-fallback` | locally validated on CPU with local int8 ONNX assets; fallback support only |
| TripoSR | `LoadTripoSRModel_`, `TripoSRSampler_` | `cpu-fallback` | locally validated on CPU after staging `model.ckpt` and a local DINO config; fallback support only |

## Blocked or high-effort families

| Family | Representative nodes | Status | Notes |
| --- | --- | --- | --- |
| Rembg / background removal GPU path | `RembgNode_Mix` | `blocked` | import path can try `pip install rembg[gpu]`; BRIA execution still hard-codes `.cuda()` |
| MiniCPM VQA | `MiniCPM_VQA_Simple` | `blocked` | constructor only resolves `cuda`/`cpu`, and unload path crashes through `torch.cuda.ipc_collect()` on non-CUDA builds |
| FishSpeech | `LoadVQGAN`, `Prompt2Semantic`, FishSpeech audio family | `blocked` | isolated import already fails on vendored `fish_speech` / `hydra` dependencies; exposed runtime devices remain `cuda`/`cpu` only |

## Package-level risk matrix

### Import-time risk

| Risk | Severity | Why |
| --- | --- | --- |
| eager optional imports | High | unsupported families can break package registration before runtime |
| auto-install behavior during import | High | startup behavior becomes environment-sensitive and hard to reason about |
| heavy requirements with no Intel gating | High | package install and startup can fail even before node execution |

Guarded harness validation can now bypass the auto-install side effects long enough to probe registration, but that does **not** remove the default bootstrap risk from the package.

### Runtime risk

| Risk | Severity | Why |
| --- | --- | --- |
| hardcoded `cuda` device selection | High | families may never select XPU |
| explicit `.cuda()` calls | High | NVIDIA-only runtime path |
| CUDA capability/cache APIs | High | family logic may break even if tensors themselves could run elsewhere |
| service and model auto-downloads | Medium | root cause can be asset/service related rather than XPU related |

## Decision table

| Question | Current answer |
| --- | --- |
| Can the repo be planned as a custom-node migration target? | **Yes** |
| Can it be treated as one homogeneous package? | **No** |
| Is tiered support the right acceptance model? | **Yes** |
| Are there Wave 1 families worth testing first? | **Yes** |
| Are some families already strong blocked candidates from source alone? | **Yes** |

## Safe first migration direction

Start with:

1. install/import/registration stabilization
2. utility and image-helper families
3. service-backed nodes where XPU is not the core question
4. modest device-cleanup families like `ClipInterrogator` and text generation

Delay:

1. `Rembg`
2. `MiniCPM`
3. `FishSpeech`

## Unsafe assumptions to avoid

1. do not treat package install success as package support
2. do not treat ComfyUI startup success as full family support
3. do not treat one example workflow as repo-wide support
4. do not hide CPU fallback under “Intel XPU works”
5. do not let blocked families disappear because unrelated families still register

## Immediate follow-up list

1. validate install/import/startup behavior with logs retained
2. smoke-test the `xpu-candidate` families by representative node
3. promote `cpu-fallback` families only after explicit fallback evidence exists
4. keep `blocked` families visible in all release notes and patch-bundle docs
