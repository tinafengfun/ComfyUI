# Mixlab Intel XPU source audit

This document is the **package-level source audit** for migrating `MixLabPro/comfyui-mixlab-nodes` to Intel XPU.

It is intentionally **not** a workflow report. The unit of analysis here is the **custom-node repository** itself: registration behavior, node families, dependencies, device assumptions, and package-level migration risk.

## Scope

Audited upstream:

- repository: `https://github.com/MixLabPro/comfyui-mixlab-nodes`
- audited upstream commit: `32b22c39cbe13b46df29ef1b6ab088c2eb4389d2`
- target runtime: **ComfyUI + Intel XPU**
- acceptance target: **tiered support**, not forced all-green full-repo parity

## Why this repo is a hard first case

`comfyui-mixlab-nodes` is not one coherent model package. It is a **multi-product node repository** that mixes:

- local image utilities
- video helpers
- VLM / prompt-generation nodes
- audio / ASR / TTS nodes
- cloud API clients
- 3D nodes
- background-removal families
- optional model downloads
- import-time auto-installs

That means package migration must be done by **family** rather than by one example workflow.

## Main package structure

The package surface is registered in `__init__.py`, with a large always-on node map plus optional families loaded conditionally.

### Always-registered or core families

From the source audit, the main always-on surface includes:

- **Prompt**
  - `RandomPrompt`
  - `EmbeddingPrompt`
  - `PromptSlide`
  - `GLIGENTextBoxApply_Advanced`
- **Input / output / UI**
  - `GridInput`
  - `ImagesPrompt_`
  - `KeyInput`
  - `TextInput_`
  - `SaveImageToLocal`
  - `CreateJsonNode`
- **Image / color / layer / mask**
  - `ResizeImageMixlab`
  - `EnhanceImage`
  - `Image3D`
  - `ImageColorTransfer`
  - `ShowLayer`
  - `MergeLayers`
  - `FaceToMask`
  - `OutlineMask`
- **Screen / audio / utils / style**
  - `ScreenShare`
  - `FloatingVideo`
  - `SpeechRecognition`
  - `SpeechSynthesis`
  - `MultiplicationNode`
  - `StyleAlignedReferenceSampler_`
- **P5**
  - `P5Input`

### Optional or conditionally imported families

The optional surface includes:

- **LLM / API**
  - `ChatGPTOpenAI`
  - `SiliconflowLLM`
  - `SiliconflowTextToImageNode`
- **Prompt generation**
  - `PromptGenerate_Mix`
  - `ChinesePrompt_Mix`
- **Vision / prompt**
  - `ClipInterrogator`
- **Background removal**
  - `RembgNode_Mix`
- **Video**
  - `VideoCombine_Adv`
  - `LoadVideoAndSegment_`
  - `GenerateFramesByCount`
- **3D**
  - `LoadTripoSRModel_`
  - `TripoSRSampler_`
- **VLM**
  - `MiniCPM_VQA_Simple`
- **Audio ASR / TTS**
  - `LoadVQGAN`
  - `Prompt2Semantic`
  - `SenseVoiceNode`
  - `LoadWhisperModel_`
  - `WhisperTranscribe_`
- **Cloud video APIs**
  - `VideoGenKlingNode`
  - `VideoGenRunwayGen3Node`
  - `VideoGenLumaDreamMachineNode`

## Package-level dependency posture

The audited `requirements.txt` is heavy and not platform-gated.

### High-risk requirements

Notable runtime-sensitive dependencies include:

- `rembg[gpu]`
- `bitsandbytes`
- `torchaudio`
- `transformers`
- `clip-interrogator==0.6.0`
- `accelerate`
- `hydra-core`
- `loralib`
- `faster_whisper`
- `opencv-python-headless`
- `imageio-ffmpeg`
- `scenedetect[opencv-headless]`

### Git dependencies

The package also pulls code directly from git:

- `git+https://github.com/shadowcz007/SenseVoice-python.git`
- `git+https://github.com/openai/swarm.git`

### Why this matters

For Intel XPU migration, this means package validation must separate:

1. **package installability**
2. **import-time registration**
3. **family runtime support**

A repo with this many optional and GPU-biased requirements can install partially while still failing at startup or family execution time.

## Import-time side effects

This repo has unusually high **import-time risk**.

### Observed risk classes

1. **Eager package imports in `__init__.py`**
   - optional families are imported during plugin load instead of being cleanly deferred
2. **Module-level auto-install behavior**
   - some modules try to install or bootstrap dependencies during import
3. **Conditional registration mixed with side effects**
   - startup may partially register families while failing others

### Why this changes the migration order

For Mixlab, the first milestone is not “node runs on XPU”. It is:

1. package installs
2. package imports
3. ComfyUI starts
4. expected node families register

Only after that is family runtime support worth discussing.

## CUDA and NVIDIA-biased source patterns

The audit found several recurring risk classes.

### 1. Hardcoded `cuda` or CUDA-only auto-selection

This pattern appears in several families, including:

- `ClipInterrogator`
- `FishSpeech`
- `TextGenerateNode`
- `Whisper`
- `SenseVoice`
- `TripoSR`
- `MiniCPM`

These families usually select between only:

- `cuda`
- `cpu`

That is not enough for Intel XPU support.

### 2. Explicit `.cuda()` calls

This is present in the `Rembg` family and is a strong signal that the current path is NVIDIA-oriented rather than device-neutral.

### 3. CUDA capability and cache APIs

Examples in the audit include:

- `torch.cuda.get_device_capability`
- `torch.cuda.empty_cache`
- `torch.cuda.ipc_collect`
- `torch.cuda.synchronize`
- CUDA-default device arguments

These are especially important in:

- `MiniCPM`
- `FishSpeech`
- helper code inside audio/model utilities

### 4. GPU-biased dependency bootstrap

`Rembg` is the clearest example:

- source-side install path prefers `rembg[gpu]`
- runtime path uses `.cuda()`

That makes it a poor first XPU target.

### 5. Requirements-only hazards

The audit did **not** find strong in-code `bitsandbytes` usage during the source pass, but `bitsandbytes` still appears in requirements.

That means it is a package-level migration hazard even when a specific family does not immediately import it.

## Family-level first-pass classification

This source audit is not the final support matrix. It is the evidence base used to build one.

### Likely low-risk or infrastructure-first families

These families look like the best **Wave 1** candidates:

- prompt helpers
- UI/input/output nodes
- image/color/layer/mask helpers
- screen-share and utility glue
- video plumbing that is mostly ffmpeg/OpenCV/service orchestration

These are still not “validated”, but they are the least CUDA-bound on source inspection.

### Likely XPU-portable after modest device cleanup

The source audit suggests these families may be recoverable with **device-string cleanup and explicit placement policy**:

- `ClipInterrogator`
- `TextGenerate` / `ChinesePrompt`
- `LaMa`

They are not yet proven on XPU, but they do not appear structurally defined by custom CUDA kernels.

### CPU-fallback-first families

These families look more realistic as **CPU fallback** than as early XPU targets:

- `Whisper`
- `SenseVoice`
- `TripoSR`

Current source behavior already resolves them toward CPU when CUDA is absent, which makes them good candidates for honest CPU-fallback support rather than speculative XPU claims.

### Blocked or high-effort families

These families are the worst first-wave targets:

- `Rembg`
- `MiniCPM`
- `FishSpeech`

Reasons include:

- explicit CUDA assumptions
- GPU-specialized dependency choices
- CUDA cache/capability APIs
- heavier inference stacks with more platform-specific behavior

## The key split: registration risk vs runtime risk

Mixlab needs a stronger distinction than most packages:

### Registration risk

A family may fail before any node executes because:

- imports are eager
- optional packages are missing
- auto-installer behavior misfires
- one heavy module breaks package startup

### Runtime risk

A family may register fine but still fail at execution because:

- it routes only to `cuda`
- it uses CUDA-only helpers
- it expects unavailable GPU wheels
- it downloads models with unsupported runtime assumptions

This repo therefore should never be summarized with a single phrase like:

> “Mixlab works on Intel XPU.”

That would collapse two very different failure surfaces.

## Audit conclusions

### What is now clear

1. `comfyui-mixlab-nodes` is a **package migration problem**, not a single-node patch problem.
2. The package has **high import-time side effects** and therefore needs install/import/startup checks before runtime claims.
3. Several families are plausible **CPU-fallback** or **XPU-candidate** targets.
4. Several other families are clearly **blocked or high-effort** due to NVIDIA/CUDA assumptions.

### What this audit does not claim

This document does **not** claim:

- repo-wide Intel XPU support
- family runtime success
- performance suitability
- deployment readiness

Those claims require the separate support matrix and test evidence.

## Immediate documentation outputs this audit supports

This source audit should feed:

1. `docs/mixlab-xpu-support-matrix.md`
2. `docs/mixlab-xpu-execution-plan.md`
3. future `patches/mixlab-xpu/README.md`

## Recommended next step

Use this audit to classify Mixlab families into:

- **XPU candidate**
- **CPU fallback**
- **optional-disabled**
- **blocked**
- **not assessed**

Then test by family in that order instead of trying to “port the whole repo” in one shot.
