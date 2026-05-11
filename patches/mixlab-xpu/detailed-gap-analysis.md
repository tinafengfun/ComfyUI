# Mixlab detailed XPU gap analysis

This report expands the current Mixlab migration review into a **gap-classification report** that can be used to decide whether a family needs:

1. a **local patch**
2. **manual integration / asset staging**
3. a separate **feature-development project**

## Scope and evidence

- package: `shadowcz007/comfyui-mixlab-nodes`
- audited commit: `32b22c39cbe13b46df29ef1b6ab088c2eb4389d2`
- source scan artifact: `../../docs/artifacts/mixlab/generated/xpu-gap-scan.tsv`
- primary source files:
  - `nodes/ClipInterrogator.py`
  - `nodes/TextGenerateNode.py`
  - `nodes/Lama.py`
  - `nodes/Whisper.py`
  - `nodes/SenseVoice.py`
  - `nodes/TripoSR.py`
  - `nodes/MiniCPMNode.py`
  - `nodes/RembgNode.py`
  - `nodes/FishSpeech.py`
  - `nodes/Video.py`
  - `nodes/scenedetectNode.py`
  - `nodes/FalVideo.py`
  - `nodes/Style.py`

The TSV scan is intentionally **broad and over-inclusive**. The tables below are the manual, migration-oriented interpretation of that raw scan.

## Gap classes used in this report

| Gap class | Meaning |
| --- | --- |
| quantization technology | int4/int8/fp16/bf16 choices or backend assumptions that may not map cleanly to Intel XPU |
| operators/runtime | attention mode, compile path, ONNX runtime, or model runtime choices that may need backend work |
| model/assets | Hugging Face downloads, trust-remote-code, model layout, or staged asset requirements |
| video codec/system media | ffmpeg, OpenCV video I/O, muxing, codec/container dependencies |
| GPU infra | hardcoded `cuda`, `.cuda()`, `torch.cuda.*`, or device routing that bypasses XPU |
| Comfy native | use of `comfy.model_management`, samplers, or other Comfy runtime APIs whose XPU behavior matters |

## High-level findings

1. The dominant Mixlab XPU gap is still **GPU infra**, not custom CUDA kernels.
2. The package has **very few explicit NVIDIA-only kernel libraries** in the audited target files:
   - no retained evidence of `bitsandbytes`
   - no retained evidence of `xformers`
   - no retained evidence of `flash-attn`
   - no retained evidence of `triton`
   - no retained evidence of TensorRT
3. The hardest families are blocked mostly by:
   - hardcoded `cuda` routing
   - CUDA-only cleanup calls
   - external runtime/provider constraints
   - vendored import/dependency problems
4. The video families are mostly **system codec / OpenCV / ffmpeg** problems, not Intel XPU kernel-port problems.
5. The most reusable gap split for staffing is:
   - **patch work**: Wave A device cleanup
   - **manual integration**: staged assets, ffmpeg/ONNX/provider setup, runtime validation
   - **feature development**: families whose runtime contract is still CUDA-shaped or architecture-heavy

## Detailed node-by-node classification

| Family / nodes | Explicit CUDA / NVIDIA dependency | Quantization technology gap | Operators / runtime gap | Model / asset gap | Video codec gap | GPU infra gap | Comfy native gap | Current migration meaning | Recommended work type |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ClipInterrogator` | previous `cuda/cpu` routing has now been replaced with Comfy execution-device routing, plus a local dtype-alignment patch for the upstream `LabelTable._rank()` path | low: only fp16 vs fp32 selection | medium: upstream CUDA autocast assumptions required a local dtype-alignment compatibility patch | medium: BLIP + clip-interrogator assets still benefit from local staging for reproducibility | none | **lower now**: core package-local routing cleanup is done and retained XPU smoke exists | low: only `folder_paths` and `comfy.utils.ProgressBar` | Wave A family with real XPU smoke now retained; remaining work is cache/local-asset hardening | **patch completed, keep validating** |
| `PromptGenerate_Mix` / `ChinesePrompt_Mix` | previous hardcoded `cuda/cpu` placement has now been replaced with Comfy execution-device routing | low: no explicit quant backend beyond normal HF runtime | low-medium: HF `pipeline('text-generation')` device plumbing must accept XPU path | medium: local model staging is still preferred for reproducibility | none | **lower now**: package-local routing cleanup has landed and retained XPU smoke exists | low: Comfy usage is light | Wave A family with real XPU smoke now retained; next work is reproducibility hardening, not basic device cleanup | **patch completed, keep validating** |
| `LaMa` | previous wrapper-level `cuda/cpu` logic has been replaced with Comfy execution-device routing | low | low: no custom CUDA operator found in wrapper | medium: normal install still fails under Python 3.13, but `--no-deps` install plus `big-lama.pt` staging now works in the current environment | none | **lower now**: wrapper cleanup is done and retained XPU smoke exists | low | Wave A family with real XPU smoke now retained; remaining work is packaging reproducibility, not core device routing | **patch completed, keep validating** |
| `Whisper` | device defaults to `"cuda"` when available; UI only exposes `auto/cpu` | **medium**: `float16`, `int8_float16`, `int8` are backend-sensitive | medium: backend behavior depends on `faster-whisper` / CTranslate2 device support | medium: model folders must be staged under `models/whisper` | none | **medium**: no XPU route in node UI or resolution logic | low | useful CPU fallback today; XPU promotion depends on external backend support, not just local code cleanup | **manual integration** |
| `SenseVoiceNode` | `if device=='auto' and torch.cuda.is_available(): self.device='cuda'` | **medium**: int8 ONNX path is central to current implementation | **high**: ONNX runtime/provider capability decides whether XPU exists at all | medium: ONNX, BPE, VAD assets must be staged | none | **medium-high**: auto path only knows `cuda`, not XPU | low | local CPU fallback is already useful; XPU path likely needs provider-level enablement | **manual integration** |
| `LoadTripoSRModel_` / `TripoSRSampler_` | device chosen via `get_torch_device()` but immediately forced to CPU when `not torch.cuda.is_available()` | low in wrapper; deeper stack not obviously quantized | medium: TSR renderer/transformer path still needs runtime validation on XPU | high: checkpoint + local DINO/config assets are required | none | **high**: package-local CUDA check overrides Comfy native device selection | **medium**: this family already tries to use `comfy.model_management.get_torch_device()` | currently a CPU-fallback family; XPU promotion needs wrapper cleanup plus runtime proof | **manual integration + patch** |
| `MiniCPM_VQA_Simple` | constructor resolves device from `torch.cuda.is_available()`, bf16 support uses CUDA capability, unload path calls `torch.cuda.empty_cache()` and `torch.cuda.ipc_collect()` | **high**: pinned to `openbmb/MiniCPM-V-2_6-int4`, dtype logic is CUDA-centric | **high**: `attn_implementation="sdpa"` and remote-code model runtime need true XPU compatibility | **high**: snapshot download + trust-remote-code + model-specific runtime contract | none | **high**: CUDA capability query and CUDA cleanup are hard blockers | low-medium: limited Comfy coupling; problem is mostly model runtime | blocked family; this is beyond device-string cleanup | **feature development** |
| `RembgNode_Mix` | BRIA path calls `.cuda()` directly for model and input tensor; earlier import behavior uses GPU-oriented `rembg[gpu]` packaging | low | **medium-high**: BRIA model uses standard conv/pool/interpolate ops, but runtime path is still CUDA-shaped | high: rembg models and BRIA weights must be present; install behavior must stay explicit | none | **high**: hard `.cuda()` path in the active BRIA execution branch | low: Comfy use is minor | blocked family; model math itself is portable, but packaging + runtime contract still make this a project | **feature development** |
| `FishSpeech` family (`LoadVQGAN`, `Prompt2Semantic`, `Semantic2Audio`) | node UI only exposes `cuda/cpu` devices | **high**: bf16/half selection is a first-class API choice | **high**: `compile` path and internal llama/vqgan runtime are major backend risks | **high**: vendored fish-speech tree, configs, checkpoints, and previous `hydra` issues all remain in play | none | **high**: no XPU path, device contract is still binary `cuda/cpu` | low | blocked family; import/dependency repair is still prerequisite work before XPU tuning | **feature development** |
| video family (`VideoCombine_Adv`, `LoadVideoAndSegment_`, `GenerateFramesByCount`, scene helpers) | no explicit CUDA or NVIDIA dependency found in the main video files | none | low: mostly CPU media processing | low-medium: depends on local ffmpeg/OpenCV/torchaudio availability | **high**: ffmpeg, OpenCV `VideoCapture` / `VideoWriter`, `XVID`, AAC muxing, imageio-ffmpeg fallback | low | medium: uses `common_upscale`, `folder_paths`, and standard Comfy I/O conventions | not an Intel XPU kernel gap; this is mostly environment/media-tooling integration | **manual integration** |
| remote/media helper `LoadVideoFromURL` / `FalVideo` | no CUDA dependency in the inspected path | none | low | low: remote service / file fetching | **medium**: OpenCV decode path must work for fetched media | none | low | not an XPU blocker; mostly network + media tooling | **manual integration** |
| `Style` / visual-style prompting sampler family | no explicit package-local CUDA branch found in sampled lines | none | **medium**: depends on Comfy sampling and attention behavior, not package-local kernels | low | none | medium: uses `load_models_gpu([model])` and device-sensitive sampler flow | **high**: success depends on Comfy core XPU path more than Mixlab-local code | not the first family to patch inside Mixlab; should be revisited after Comfy-native path is proven stable | **Comfy-core dependent feature follow-up** |

## Category-specific gap scan

### 1. Quantization technology gaps

These gaps are not all blockers, but they determine whether a family is patchable or becomes backend work.

| Family | Evidence | Why it matters on XPU |
| --- | --- | --- |
| `MiniCPM_VQA_Simple` | `openbmb/MiniCPM-V-2_6-int4`, `torch.bfloat16 if self.bf16_support else torch.float16`, CUDA capability query | combines model-specific quantization with CUDA-specific feature detection |
| `Whisper` | `compute_type` exposes `float16`, `int8_float16`, `int8` | backend support belongs to `faster-whisper` / CTranslate2, not Mixlab itself |
| `SenseVoiceNode` | int8 ONNX encoder is the default favored path | actual XPU viability depends on ONNX Runtime provider support |
| `FishSpeech` | `precision` only exposes `bf16` / `half` | precision policy is tied to runtime/backend support, not just node wrapper cleanup |
| `ClipInterrogator` / `LaMa` | fp16-vs-fp32 style choices only | these are lower-risk and likely patchable |

### 2. Operators / runtime gaps

| Family | Evidence | Engineering meaning |
| --- | --- | --- |
| `MiniCPM_VQA_Simple` | `attn_implementation="sdpa"` | must verify model runtime and attention path on Intel XPU, not just device string |
| `FishSpeech` | `compile` is a user-visible runtime switch | potential feature work if torch compile or model graph path is unstable on XPU |
| `RembgNode_Mix` | BRIA path uses PyTorch conv/pool/interpolate stack | operators are not obviously NVIDIA-only, but the wrapper still hard-binds to CUDA |
| `Style` / visual-style prompting | depends on Comfy samplers and attention utilities | if it fails, the owner is likely Comfy-native XPU support rather than Mixlab-only patching |

### 3. Model / asset gaps

The package still relies heavily on external staged assets.

| Family | Evidence | Migration impact |
| --- | --- | --- |
| `ClipInterrogator` | BLIP assets via `from_pretrained` | requires controlled model staging before runtime claims |
| `TextGenerateNode` | translator + prompt-generator HF models | patching device logic is not enough without local model availability |
| `SenseVoiceNode` | `snapshot_download`, ONNX encoder, BPE, VAD assets | strong manual integration requirement |
| `TripoSR` | checkpoint + TSR config + local DINO preference | repeatability depends on staging exact assets |
| `MiniCPM_VQA_Simple` | `snapshot_download` + `trust_remote_code=True` | bigger supply-chain and runtime surface than Wave A families |
| `RembgNode_Mix` | `hf_hub_download` for BRIA weights | still needs explicit install/model handling |
| `FishSpeech` | vendored config + checkpoint families | large asset surface and integration complexity |

### 4. Video codec / system media gaps

These are not GPU-port gaps, but they are real release blockers for video workflows.

| Family | Evidence | Migration impact |
| --- | --- | --- |
| `Video.py` | `ffmpeg`, `VideoCapture`, `VideoWriter`, `XVID`, `aac`, `imageio_ffmpeg` fallback | needs media-tool validation in the deployment environment |
| `scenedetectNode.py` | OpenCV scene split + `VideoWriter_fourcc(*'XVID')` | codec/container behavior depends on system packages |
| `FalVideo.py` / `LoadVideoFromURL` | OpenCV decode of remote `.mp4` | integration work is around media decoding, not XPU |

### 5. GPU infra gaps

This is still the most important class for Mixlab.

| Pattern | Families affected | Meaning |
| --- | --- | --- |
| `"cuda" if torch.cuda.is_available() else "cpu"` | `ClipInterrogator`, `TextGenerateNode`, `Lama`, `Whisper`, `SenseVoiceNode` | XPU never becomes a first-class device |
| direct `.cuda()` | `RembgNode_Mix` | hard blocker until rewritten |
| `torch.cuda.empty_cache()` / `torch.cuda.ipc_collect()` | `MiniCPM_VQA_Simple` | unload path breaks on non-CUDA builds |
| Comfy device chosen but overridden back to CPU | `TripoSR` | package-local logic defeats Comfy native XPU selection |
| device API only exposes `cuda/cpu` | `FishSpeech` | requires API and runtime contract expansion |

### 6. Comfy native XPU gaps

Not all gaps belong to Mixlab itself.

| Family | Comfy-native dependency | What it means |
| --- | --- | --- |
| `TripoSR` | `get_torch_device()` | Mixlab should stop overriding Comfy's device decision with CUDA-only logic |
| `Style` | `load_models_gpu`, samplers, sample pipeline | if this family fails on XPU, the fix may belong in Comfy core rather than Mixlab |
| video / mask / image helpers | `common_upscale`, `SaveImage`, `common_ksampler`, `folder_paths` | mostly neutral; these are not the main XPU blockers today |

## Staffing split: patch vs manual integration vs feature work

### Patch-first candidates

These are still the best near-term XPU conversion targets:

1. `ClipInterrogator`
2. `PromptGenerate_Mix`
3. `ChinesePrompt_Mix`
4. `LaMa`

Why:

- mostly wrapper-level device cleanup
- no clear custom CUDA-kernel porting requirement found
- asset staging is manageable
- good chance of producing the first honest Mixlab native-XPU runtime evidence

### Manual integration candidates

These need environment/runtime ownership more than deep package rewrites:

1. `Whisper`
2. `SenseVoiceNode`
3. `TripoSR`
4. video/media families

Typical owner actions:

- stage exact model assets
- decide whether the backend really has XPU support
- validate codec / ffmpeg / OpenCV behavior in the target environment
- only then decide whether package-local cleanup is worth the final promotion

### Feature-development candidates

These should be treated as separate engineering projects:

1. `MiniCPM_VQA_Simple`
2. `RembgNode_Mix`
3. `FishSpeech`

Why:

- their contracts are still CUDA-shaped
- they contain cleanup or runtime behavior that is not XPU-safe today
- they require more than simple device-string replacement

## Practical implication for the next migration round

The next Mixlab XPU round should still prioritize:

1. Wave A patch targets (`ClipInterrogator`, prompt generation, `LaMa`)
2. one device-neutral helper family for a fast native-XPU proof
3. only then re-open fallback families for backend/provider evaluation

The blocked families should stay visible, but they should be staffed as **feature work**, not as the default next patch pass.
