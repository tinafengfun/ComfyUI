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

## Current validated outcome

This matrix started as a first-pass posture table. Current migration evidence narrows it:

- **prompt validation:** all three preserved output branches pass
- **reduced-resource smoke:** all three preserved output branches execute on B60/XPU
- **full-size blocker:** branch `54` still fails at node `41` because the first full-size `WAN21` denoise peak exceeds the single-card budget
- **asset gap still open:** the original proprietary low-noise filenames remain unresolved and are covered only by smoke-only compatibility aliases

## Core generation matrix

| Family | Nodes in workflow | Status | Notes |
| --- | --- | --- | --- |
| Wan sampling core | `KSamplerAdvanced`, `ModelSamplingSD3` | `supported` | Same core family as the previously migrated Dasiwa flow, but still needs fresh runtime proof on this new graph |
| Wan UNet loading | `UNETLoader` | `config-needed` | high-noise UNet is resolved; low-noise proprietary names still rely on smoke-only aliases |
| Text encoder loading | `CLIPLoader` | `supported` | `umt5_xxl_fp16.safetensors` is now staged locally and runs CPU-biased safely |
| VAE loading/decode | `VAELoader`, `VAEDecode` | `supported` | Standard Wan VAE path; local VAE exists; CPU and XPU placement both have been exercised for different purposes |
| Multi-frame Wan conditioning | `WanMultiFrameRefToVideo` | `audit-needed` | New custom-node family for this workflow; repo identified, runtime behavior still unverified |
| First/last-frame Wan conditioning | `WanFirstLastFrameToVideo` | `audit-needed` | Similar family to prior flows but still needs branch-specific proof here |
| Painter image-to-video | `PainterI2V` | `audit-needed` | Candidate repo found, but node behavior and model assumptions still need source/runtime inspection |

## Modifier and memory-policy matrix

| Family | Nodes in workflow | Status | Notes |
| --- | --- | --- | --- |
| Sage attention patch | `PathchSageAttentionKJ` | `config-needed` | Current workflow uses `sage_attention=auto`; safe initial XPU migration should force `disabled` |
| Torch accumulation patch | `ModelPatchTorchSettings` | `config-needed` | Current workflow snapshot shows `enable_fp16_accumulation=true`; expected XPU migration override is `false` |
| Model VRAM queue | `LaoLi_Lineup` | `gap-likely` | does not solve the decisive first denoise activation OOM; treat as non-solution until a real XPU-specific memory benefit is proven |
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
| VQA helper | `Qwen3_VQA` | `config-needed` | workflow runs now keep it CPU-biased / non-FP8-safe; still not a good target for aggressive XPU placement |
| Text display | `ShowText|pysssss` | `supported` | UI/helper node |
| Literal/control nodes | `Int`, `INTConstant`, `PrimitiveInt` | `supported` | low risk |
| `Fast Groups Bypasser (rgthree)` | control/UI | `supported` | non-compute workflow helper |
| `PreviewImage`, `Note`, `Reroute` | control/UI | `supported` | not migration blockers |

## Precision and memory posture

| Asset class | Current first-pass posture |
| --- | --- |
| High-noise UNet | resolved and staged; still too large for casual residency assumptions |
| Low-noise UNet variants | original proprietary sources unresolved; smoke aliases exist |
| Text encoder | resolved and staged; CPU placement remains the safe default |
| VAE | available locally and small enough to evaluate on either CPU or XPU |
| LoRAs | resolved and staged |

## B60 migration decision table

| Decision | Current answer |
| --- | --- |
| Can the workflow be planned for B60 migration? | **Yes** |
| Can it be claimed smoke-runnable on B60 today? | **Yes** |
| Can it be claimed full-size-ready on a single 24 GB B60 today? | **No** |
| Biggest current blockers | full-size WAN21 activation peak on branch `54`, unresolved proprietary low-noise source files |
| Safe first migration direction | CPU-safe helper baseline + XPU Wan core only |
| Unsafe assumptions to avoid | assuming smoke alias success equals full-size fidelity, or that generic lowvram fixes the proven full-size OOM |

## Immediate follow-up list

1. preserve the resolved-vs-aliased asset distinction in future handoffs
2. inspect `LaoLi_Lineup`, `RAMCleanup`, `VRAMCleanup`, `easy cleanGpuUsed`, `Qwen3_VQA`, and `RIFE VFI`
3. prepare or retain a conservative first-run configuration with:
   - SageAttention disabled
   - FP16 accumulation disabled
   - resize/aspect nodes on CPU
   - helper/VQA branches isolated if needed
4. treat full-size branch `54` as a memory-capacity problem unless a future multi-GPU or activation-level fix changes the evidence
