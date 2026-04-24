# Dasiwa B60 XPU support matrix

This matrix summarizes the first-pass Intel XPU B60 support posture for the new Dasiwa WAN2.2 workflow.

Target boundary:

- **single Intel XPU B60**
- **24 GB effective memory budget**
- **ComfyUI repository only**

## Status legend

| Status | Meaning |
| --- | --- |
| `supported` | already expected to work on XPU or CPU without code changes |
| `config-needed` | migration is plausible, but a known setting must be changed |
| `audit-needed` | source/runtime audit is required before trusting it on XPU |
| `gap-likely` | strong evidence that the current implementation is CUDA-biased or otherwise unsuitable as-is |
| `blocked-by-assets` | runtime support cannot be judged until models or LoRAs are available |

## Core generation matrix

| Family | Nodes in workflow | Status | Notes |
| --- | --- | --- | --- |
| Wan sampling core | `KSamplerAdvanced`, `ModelSamplingSD3` | `supported` | Same core family as the previously migrated Dasiwa flow, but still needs fresh runtime proof on this new graph |
| Wan UNet loading | `UNETLoader` | `blocked-by-assets` | Primary UNets are missing locally, so sizing and runtime checks are incomplete |
| Text encoder loading | `CLIPLoader` | `blocked-by-assets` | `umt5_xxl_fp16.safetensors` is not resolved locally |
| VAE loading/decode | `VAELoader`, `VAEDecode` | `supported` | Standard Wan VAE path; local VAE exists |
| Multi-frame Wan conditioning | `WanMultiFrameRefToVideo` | `audit-needed` | New custom-node family for this workflow; repo identified, runtime behavior still unverified |
| First/last-frame Wan conditioning | `WanFirstLastFrameToVideo` | `audit-needed` | Similar family to prior flows but still needs branch-specific proof here |
| Painter image-to-video | `PainterI2V` | `audit-needed` | Candidate repo found, but node behavior and model assumptions still need source/runtime inspection |

## Modifier and memory-policy matrix

| Family | Nodes in workflow | Status | Notes |
| --- | --- | --- | --- |
| Sage attention patch | `PathchSageAttentionKJ` | `config-needed` | Current workflow uses `sage_attention=auto`; safe initial XPU migration should force `disabled` |
| Torch accumulation patch | `ModelPatchTorchSettings` | `config-needed` | Current workflow snapshot shows `enable_fp16_accumulation=true`; expected XPU migration override is `false` |
| Model VRAM queue | `LaoLi_Lineup` | `gap-likely` | Candidate source uses `torch.cuda.*` memory APIs and CUDA device checks |
| VRAM cleanup | `VRAMCleanup` | `audit-needed` | Candidate repo identified, but must inspect for CUDA-only logic before use |
| RAM cleanup | `RAMCleanup` | `audit-needed` | Same risk class as VRAM cleanup helpers |
| easy-use GPU cleanup | `easy cleanGpuUsed` | `audit-needed` | Likely GPU/CUDA cleanup semantics, not yet proven for XPU |

## Image and post-process matrix

| Family | Nodes in workflow | Status | Notes |
| --- | --- | --- | --- |
| Resize / aspect scaling | `ImageResizeKJv2`, `LayerUtility: ImageScaleByAspectRatio V2` | `config-needed` | Safe initial assumption is CPU placement, especially with `lanczos` |
| Frame interpolation | `RIFE VFI` | `audit-needed` | Candidate repo identified; XPU runtime, kernels, and memory pressure still unverified |
| Batch/image helpers | `GetImagesFromBatchIndexed`, `ImageBatchMulti`, `ImageConcatMulti` | `supported` | Functional glue nodes; likely low XPU risk by themselves |
| Video combine | `VHS_VideoCombine` | `supported` | Output path, not an XPU blocker |

## Prompt / helper / utility matrix

| Family | Nodes in workflow | Status | Notes |
| --- | --- | --- | --- |
| Prompt editing | `Prompt_Edit` | `supported` | Functional text helper unless source audit reveals extra heavy runtime behavior |
| VQA helper | `Qwen3_VQA` | `gap-likely` | Candidate source uses CUDA capability checks, `torch.cuda.empty_cache`, and auto device mapping |
| Text display | `ShowText|pysssss` | `supported` | UI/helper node |
| Literal/control nodes | `Int`, `INTConstant`, `PrimitiveInt` | `supported` | low risk |
| `Fast Groups Bypasser (rgthree)` | control/UI | `supported` | non-compute workflow helper |
| `PreviewImage`, `Note`, `Reroute` | control/UI | `supported` | not migration blockers |

## Precision and memory posture

| Asset class | Current first-pass posture |
| --- | --- |
| High-noise UNet | blocked until `wan2.2_i2v_A14b_high_noise_scaled_fp8_e4m3_lightx2v_4step_comfyui.safetensors` is sourced and sized |
| Low-noise UNet variants | blocked until `wan22I2VLLSDasiwaNm.low.safetensors` and `dasiwaWAN22I2V14B_radiantcrushLow.safetensors` are sourced and sized |
| Text encoder | blocked until `umt5_xxl_fp16.safetensors` is sourced |
| VAE | available locally and small enough to keep as an XPU candidate |
| LoRAs | unresolved locally; final branch memory cannot be trusted until they are staged |

## B60 migration decision table

| Decision | Current answer |
| --- | --- |
| Can the workflow be planned for B60 migration? | **Yes** |
| Can it be claimed runtime-ready on B60 today? | **No** |
| Biggest current blockers | missing models/LoRAs, CUDA-biased helper nodes, unverified interpolation + VQA branches |
| Safe first migration direction | CPU-safe helper baseline + XPU Wan core only |
| Unsafe assumptions to avoid | assuming all cleanup helpers, SageAttention, Qwen VQA, and RIFE are XPU-ready without audit |

## Immediate follow-up list

1. resolve the missing model and LoRA source map
2. inspect `LaoLi_Lineup`, `RAMCleanup`, `VRAMCleanup`, `easy cleanGpuUsed`, `Qwen3_VQA`, and `RIFE VFI`
3. prepare a conservative first-run configuration with:
   - SageAttention disabled
   - FP16 accumulation disabled
   - resize/aspect nodes on CPU
   - helper/VQA branches isolated if needed
4. run branch smoke tests before any optimization work
