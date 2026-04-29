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

## Package function and migration snapshot

Mixlab is a **multi-module custom-node package**, not a single model node.

Its main functional areas are:

| Module family | Representative nodes | Purpose |
| --- | --- | --- |
| Prompt / UI / I/O | `RandomPrompt`, `EmbeddingPrompt`, `GridInput`, `TextInput_`, `SaveImageToLocal` | prompt assembly, input/output, UI helpers |
| Image / mask / layer | `ResizeImageMixlab`, `EnhanceImage`, `ImageColorTransfer`, `MergeLayers`, `FaceToMask` | image preprocessing, mask/layer operations, visual helpers |
| Video | `VideoCombine_Adv`, `LoadVideoAndSegment_`, `GenerateFramesByCount` | frame extraction, video segmenting, video combine |
| Text / multimodal | `ClipInterrogator`, `PromptGenerate_Mix`, `ChinesePrompt_Mix`, `MiniCPM_VQA_Simple` | prompt generation, image-text understanding, VQA |
| Audio / speech | `LoadWhisperModel_`, `WhisperTranscribe_`, `SenseVoiceNode`, `LoadVQGAN`, `Prompt2Semantic` | ASR, semantic/audio generation helpers |
| 3D | `LoadTripoSRModel_`, `TripoSRSampler_` | image-to-3D mesh generation |
| Background removal | `RembgNode_Mix` | rembg / BRIA-based background removal |
| Cloud services | `ChatGPTOpenAI`, `SiliconflowLLM`, `VideoGenKlingNode` | external LLM and media API orchestration |

### Runtime ordering model

Mixlab currently has two important execution layers:

1. **Package bootstrap**
   - `__init__.py` checks dependencies and registers core + optional families
   - the original package also attempted import-time auto-installs, which made startup unstable
2. **Family runtime**
   - `Whisper`: `LoadWhisperModel_` -> `WhisperTranscribe_`
   - `SenseVoice`: `SenseVoiceNode` loads ONNX/VAD/ASR directly
   - `TripoSR`: `LoadTripoSRModel_` -> `TripoSRSampler_`
   - `MiniCPM`: constructor -> model availability/download -> inference -> unload cleanup
   - `Rembg`: dependency bootstrap -> rembg/BRIA execution path
   - `FishSpeech`: vendored `fish_speech` import chain -> `hydra` / llama / vqgan runtime path

### Current XPU blockers

The main Intel XPU migration blockers are:

1. import-time side effects such as automatic `pip install`
2. device routing that only supports `cuda` / `cpu`
3. hardcoded CUDA APIs such as `.cuda()`, `torch.cuda.empty_cache()`, `torch.cuda.ipc_collect()`, and `torch.cuda.synchronize()`
4. GPU-biased or CUDA-only dependency choices such as `rembg[gpu]`

### Current CPU fallback coverage

The following families are now explicitly validated as **CPU fallback only**:

| Family | Current fallback shape | Notes |
| --- | --- | --- |
| `Whisper` | CPU `faster-whisper-tiny` | transcription path completed successfully on CPU |
| `SenseVoice` | CPU ONNX int8 | VAD + ASR succeeded on CPU with staged local assets |
| `TripoSR` | CPU model load + CPU sampler | local DINO config preference was added to keep the path reproducible |

### Migration outlook

- **Most promising XPU candidates**: `ClipInterrogator`, `PromptGenerate_Mix`, `ChinesePrompt_Mix`, `LaMa`, and lower-risk image/video helper families
- **Possible but higher-effort**: `Whisper`, `SenseVoice`, `TripoSR`
- **Currently high-risk / blocked**: `Rembg`, `MiniCPM`, `FishSpeech`

So the honest current package status is:

- bootstrap and registration are now workable
- three families are usable as CPU fallback
- three families remain blocked
- there is still no retained native-XPU family execution evidence for the remaining `xpu-candidate` rows

Use this directory to preserve both sides of the story:

1. what fails in the untouched baseline
2. what becomes testable under guarded validation patches
3. what becomes cleaner after bootstrap hardening
4. what is still honestly blocked or fallback-only afterward
