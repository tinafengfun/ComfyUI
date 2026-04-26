# Workflow analysis: `DaSiWa-WAN2.2图生视频流-支持单图_双图_三图出视频json.json`

## Scope

This document is the first-pass feasibility analysis for migrating the workflow to **Intel XPU B60** under a **single-card 24 GB budget** in the **ComfyUI** codebase.

The goal of this pass is not to claim that the workflow already runs on B60. The goal is to prove:

1. what the workflow depends on
2. which parts are likely to work on XPU already
3. which parts are CUDA-biased or otherwise risky
4. what model and memory gaps block a reliable 24 GB layout today

## Current validated state after migration work

The document started as a first-pass feasibility note. The workflow has since progressed beyond that point:

### What is now proven

1. **All three preserved output branches can be prompt-validated and smoke-executed on B60/XPU** with workflow-preserving runtime overrides.
2. **The original workflow JSON remains unchanged.**
3. **Publicly resolvable assets were staged successfully** for:
   - `umt5_xxl_fp16.safetensors`
   - `wan_2.1_vae.safetensors`
   - `Wan2.2-Fun-A14B-InP-low-noise-HPS2.1.safetensors`
   - `Wan2.2-Fun-A14B-InP-high-noise-MPS.safetensors`
   - `lightx2v_I2V_14B_480p_cfg_step_distill_rank256_bf16.safetensors`
   - `wan2.2_i2v_A14b_high_noise_scaled_fp8_e4m3_lightx2v_4step_comfyui.safetensors`
4. **The unresolved proprietary low-noise UNets were handled only through smoke-only compatibility aliases**, not through recovered source-identical files.
5. **The full-size blocker moved from "asset / node uncertainty" to a real memory limit**:
   - branch: `54`
   - node: `41`
   - model path at runtime: plain `WAN21`
   - failure: `UR_RESULT_ERROR_OUT_OF_DEVICE_MEMORY`

### What is still not proven

1. **Full-size `1024 / 81-frame` branch `54` does not complete on a single 24 GB B60.**
2. **The original proprietary low-noise UNet sources are still unresolved**:
   - `wan22I2VLLSDasiwaNm.low.safetensors`
   - `dasiwaWAN22I2V14B_radiantcrushLow.safetensors`
3. **Smoke success should not be read as full-fidelity equivalence** when compatibility aliases are in use.

## Current validated state after migration work

The document started as a first-pass feasibility note. The workflow has since progressed beyond that point:

### What is now proven

1. **All three preserved output branches can be prompt-validated and smoke-executed on B60/XPU** with workflow-preserving runtime overrides.
2. **The original workflow JSON remains unchanged.**
3. **Publicly resolvable assets were staged successfully** for:
   - `umt5_xxl_fp16.safetensors`
   - `wan_2.1_vae.safetensors`
   - `Wan2.2-Fun-A14B-InP-low-noise-HPS2.1.safetensors`
   - `Wan2.2-Fun-A14B-InP-high-noise-MPS.safetensors`
   - `lightx2v_I2V_14B_480p_cfg_step_distill_rank256_bf16.safetensors`
   - `wan2.2_i2v_A14b_high_noise_scaled_fp8_e4m3_lightx2v_4step_comfyui.safetensors`
4. **The unresolved proprietary low-noise UNets were handled only through smoke-only compatibility aliases**, not through recovered source-identical files.
5. **The full-size blocker moved from "asset / node uncertainty" to a real memory limit**:
   - branch: `54`
   - node: `41`
   - model path at runtime: plain `WAN21`
   - failure: `UR_RESULT_ERROR_OUT_OF_DEVICE_MEMORY`

### What is still not proven

1. **Full-size `1024 / 81-frame` branch `54` does not complete on a single 24 GB B60.**
2. **The original proprietary low-noise UNet sources are still unresolved**:
   - `wan22I2VLLSDasiwaNm.low.safetensors`
   - `dasiwaWAN22I2V14B_radiantcrushLow.safetensors`
3. **Smoke success should not be read as full-fidelity equivalence** when compatibility aliases are in use.

## Topology summary

| Item | Value |
| --- | ---: |
| Workflow nodes | 231 |
| Links | 248 |
| `mode=0` nodes | 231 |
| `mode=4` nodes | 0 |
| Main video outputs | 3 |
| `KSamplerAdvanced` nodes | 6 |
| `UNETLoader` nodes | 6 |
| `LoraLoaderModelOnly` nodes | 9 |
| `RIFE VFI` nodes | 3 |
| `Qwen3_VQA` nodes | 3 |

The workflow is much broader than the previously migrated Dasiwa graph. It combines:

- core Wan image/video generation
- multi-frame reference generation
- LoRA-conditioned low/high-noise paths
- interpolation/post-processing
- VRAM/RAM cleanup helpers
- prompt/VQA/utility nodes from several extra custom-node packages

## Node inventory by family

### Core generation path

| Node type | Count | Role |
| --- | ---: | --- |
| `KSamplerAdvanced` | 6 | Main denoising/sampling stages |
| `ModelSamplingSD3` | 4 | Sampler model wrapping / shift configuration |
| `UNETLoader` | 6 | Main diffusion model loading |
| `CLIPLoader` | 3 | Text encoder loading |
| `CLIPTextEncode` | 6 | Prompt encoding |
| `VAELoader` | 3 | VAE loading |
| `VAEDecode` | 3 | Latent → image decode |
| `WanFirstLastFrameToVideo` | 1 | Start/end-frame guided Wan branch |
| `WanMultiFrameRefToVideo` | 1 | Multi-frame reference Wan branch |
| `PainterI2V` | 1 | Additional image-to-video branch logic |

### Conditioning and model modifiers

| Node type | Count | Role |
| --- | ---: | --- |
| `LoraLoaderModelOnly` | 9 | LoRA attachment |
| `PathchSageAttentionKJ` | 6 | Attention patching |
| `ModelPatchTorchSettings` | 6 | FP16 accumulation flag control |
| `LaoLi_Lineup` | 6 | VRAM queue / cleanup patching around models |

### Post-process and output

| Node type | Count | Role |
| --- | ---: | --- |
| `RIFE VFI` | 3 | Frame interpolation |
| `VHS_VideoCombine` | 3 | Final MP4 generation |
| `LayerUtility: ImageScaleByAspectRatio V2` | 4 | Resize / aspect correction |
| `GetImagesFromBatchIndexed` | 3 | Batch slicing |
| `ImageConcatMulti` | 2 | Image concat |
| `ImageBatchMulti` | 1 | Batch assembly |
| `ImageResizeKJv2` | 2 | Image resize |

### Utility / control / diagnostic nodes

| Node type | Count | Role |
| --- | ---: | --- |
| `Qwen3_VQA` | 3 | Multimodal prompt / image understanding helper |
| `Prompt_Edit` | 3 | Prompt manipulation |
| `ShowText|pysssss` | 3 | UI/debug text display |
| `RAMCleanup` | 4 | RAM cleanup helper |
| `VRAMCleanup` | 4 | VRAM cleanup helper |
| `easy cleanGpuUsed` | 1 | GPU memory cleanup helper |
| `Int`, `INTConstant`, `PrimitiveInt` | 12 | Control values |
| `Fast Groups Bypasser (rgthree)` | 4 | UI/control grouping |
| `Reroute` | 89 | Graph routing only |
| `PreviewImage` | 6 | UI preview only |
| `Note` | 17 | UI note only |

## Output branch overview

Three `VHS_VideoCombine` outputs are present:

- `54`
- `131`
- `208`

From prompt-subgraph inspection:

| Output node | First-pass branch signature | Interpretation |
| --- | --- | --- |
| `54` | `KSamplerAdvanced` + `VAEDecode` + `RIFE VFI` + `LaoLi_Lineup` + cleanup nodes | main generated video branch with interpolation and memory helpers |
| `131` | `KSamplerAdvanced` + `VAEDecode` + `RIFE VFI` + `LaoLi_Lineup` + `easy cleanGpuUsed` | alternate generated video branch with different cleanup stack |
| `208` | `RIFE VFI` → `VHS_VideoCombine` | output branch that is downstream of interpolation only in the extracted prompt subgraph |

The file name and node mix imply the workflow is designed to cover:

1. single-image video generation
2. dual-image / first-last-frame generation
3. triple-image / multi-frame-reference generation

That means migration and test coverage must treat the workflow as **multi-scenario**, not as one linear branch.

## Custom-node dependency map

| Package / candidate repo | Node types seen | Current state |
| --- | --- | --- |
| `ComfyUI-KJNodes` | `PathchSageAttentionKJ`, `ModelPatchTorchSettings`, `INTConstant`, `ImageResizeKJv2`, `GetImagesFromBatchIndexed`, `ImageBatchMulti`, `ImageConcatMulti` | already known in current environment |
| `ComfyUI-VideoHelperSuite` | `VHS_VideoCombine` | already known |
| `ComfyUI_LayerStyle` | `LayerUtility: ImageScaleByAspectRatio V2` | already known |
| `rgthree-comfy` | `Fast Groups Bypasser (rgthree)` | already known |
| `ComfyLiterals` | `Int` | candidate repo identified |
| `ComfyUI-Custom-Scripts` | `ShowText|pysssss` | candidate repo identified |
| `ComfyUI-Easy-Use` | `easy cleanGpuUsed` | candidate repo identified |
| `ComfyUI-Frame-Interpolation` | `RIFE VFI` | candidate repo identified |
| `ComfyUI-LaoLi-lineup` | `LaoLi_Lineup` | candidate repo identified |
| `ComfyUI-PainterNodes` | `PainterI2V` | candidate repo identified |
| `ComfyUI_Qwen3-VL-Instruct` | `Qwen3_VQA` | candidate repo identified |
| `ComfyUI-Wan22FMLF` | `WanMultiFrameRefToVideo` | candidate repo identified |
| `Comfyui_Prompt_Edit` | `Prompt_Edit` | candidate repo identified |
| `Comfyui-Memory_Cleanup` | `RAMCleanup`, `VRAMCleanup` | candidate repo identified |

The asset tooling has already been extended so these packages are no longer left as generic `unknown` packages in inventory output.

## Model inventory and current gaps

### Core models currently referenced

| Role | Model name(s) | Current local status |
| --- | --- | --- |
| UNet | `Wan/wan2.2_i2v_A14b_high_noise_scaled_fp8_e4m3_lightx2v_4step_comfyui.safetensors` | resolved and staged |
| UNet | `Wan/wan22I2VLLSDasiwaNm.low.safetensors` | original source unresolved; smoke alias only |
| UNet | `dasiwaWAN22I2V14B_radiantcrushLow.safetensors` | original source unresolved; smoke alias only |
| Text encoder | `Wan/umt5_xxl_fp16.safetensors` | resolved and staged |
| Text encoder | `umt5_xxl_fp16.safetensors` | resolved and staged |
| VAE | `Wan/wan_2.1_vae.safetensors` / `wan_2.1_vae.safetensors` | resolved and staged |

### LoRA references now resolved locally

| LoRA name | Nodes |
| --- | --- |
| `Wan/Wan2.2-Fun-A14B-InP-high-noise-MPS.safetensors` | `17` |
| `Wan/Wan2.2-Fun-A14B-InP-low-noise-HPS2.1.safetensors` | `16` |
| `Wan/lightx2v_I2V_14B_480p_cfg_step_distill_rank256_bf16.safetensors` | `231` |
| `Wan2.2-Fun-A14B-InP-high-noise-MPS.safetensors` | `96`, `302` |
| `Wan2.2-Fun-A14B-InP-low-noise-HPS2.1.safetensors` | `95`, `301` |
| `lightx2v_I2V_14B_480p_cfg_step_distill_rank256_bf16.safetensors` | `127`, `303` |

### What this means

The workflow is no longer blocked by general asset incompleteness. The remaining asset gap is narrower and should be described precisely:

- the **publicly available high-noise UNet, text encoder, VAE, and LoRAs are staged**
- the **remaining source gap is the pair of proprietary low-noise UNet filenames**
- smoke and branch-level migration work can proceed with compatibility aliases
- fidelity and full-size claims should still keep the alias caveat explicit

## XPU support and gap analysis

### Likely already supportable or low-risk with current ComfyUI/XPU path

| Node family | Status | Notes |
| --- | --- | --- |
| `UNETLoader`, `CLIPLoader`, `VAELoader`, `VAEDecode`, `KSamplerAdvanced`, `ModelSamplingSD3` | **conditionally supportable** | Core ComfyUI/Wan path; previous Dasiwa migration proved this family can run on Intel XPU when configuration is adjusted correctly |
| `VHS_VideoCombine` | **supportable** | File output / ffmpeg wrapper path, not XPU-critical |
| `Int`, `INTConstant`, `PrimitiveInt`, `Prompt_Edit`, `ShowText|pysssss`, `PreviewImage`, `Note`, `Reroute` | **low risk / CPU-only functional nodes** | Not expected to block XPU migration directly |

### Needs configuration changes based on previous XPU findings

| Node family | Status | Why it matters |
| --- | --- | --- |
| `PathchSageAttentionKJ` | **known gap / must be overridden** | This workflow currently sets `sage_attention="auto"`. Prior Dasiwa migration showed SageAttention paths are not the safe Intel XPU route; expected first migration step is to force `disabled` |
| `ModelPatchTorchSettings` | **known risk / must be audited** | This workflow currently has `enable_fp16_accumulation=true` on the KJ nodes visible in the JSON; previous migration required forcing this to `false` on XPU |
| `ImageResizeKJv2` / `LayerUtility: ImageScaleByAspectRatio V2` | **CPU-biased** | Prior XPU migration showed Lanczos-style resize paths were not safe on GPU/XPU; this workflow uses LayerStyle scaling with `method=lanczos`, so CPU placement is the safe assumption |

### High-risk / likely gap until proven otherwise

| Node family | Status | Evidence |
| --- | --- | --- |
| `LaoLi_Lineup` | **high risk / CUDA-biased** | Candidate code uses `device.type == 'cuda'`, `torch.cuda.memory_reserved`, `torch.cuda.synchronize`, and related CUDA-only flows |
| `RAMCleanup`, `VRAMCleanup`, `easy cleanGpuUsed` | **high risk / cleanup semantics must be audited** | By name and candidate repo behavior, these likely encode CUDA/GPU-specific cleanup assumptions; they should not be trusted on XPU without source inspection and runtime tests |
| `Qwen3_VQA` | **high risk / likely unsupported as-is on XPU** | Candidate repo uses `torch.cuda.is_available()`, `torch.cuda.get_device_capability`, `torch.cuda.empty_cache`, `torch.cuda.ipc_collect`, and bitsandbytes-style quantization config; this is a strong CUDA bias |
| `RIFE VFI` | **unverified / likely memory-heavy** | Interpolation is a real compute stage, but the custom-node package and model path need separate validation on Intel XPU |
| `PainterI2V` | **unverified** | New custom branch logic not present in the prior migration; source and model requirements still need inspection |
| `WanMultiFrameRefToVideo` | **unverified** | New reference-conditioning path; source repo has been identified but runtime/XPU behavior is not yet validated |

## Precision and resource assumptions

### What is already visible from names/config

- One UNet filename explicitly advertises **`fp8_e4m3`** in the name: `wan2.2_i2v_A14b_high_noise_scaled_fp8_e4m3_lightx2v_4step_comfyui.safetensors`
- Text encoders are **`fp16`** variants by name
- VAE is the standard `wan_2.1_vae.safetensors`
- LoRA names include `bf16` in some variants

### Why the 24 GB estimate is now sharper

The asset picture is much better than in the first pass, so the memory story is no longer just a rough lower bound:

- the high-noise UNet, text encoder, VAE, and LoRAs are all staged and measurable
- the remaining source gap is the pair of proprietary low-noise filenames
- runtime instrumentation has already shown that full-size branch `54` fails at the first `WAN21` denoise step, not during generic asset loading

So the current blocker should be read as a real runtime capacity issue, not as a placeholder estimate waiting for all assets to be found.

## Provisional 24 GB placement strategy

Given the current evidence, the safe B60 plan is:

| Component family | Initial placement assumption | Reason |
| --- | --- | --- |
| active branch UNet | XPU candidate | main compute target if size and kernels allow |
| inactive branch UNets | CPU/offload | too risky to keep every branch resident in 24 GB |
| text encoders | CPU first | low compute density, preserve XPU headroom |
| VAE | evaluate both CPU and XPU | prior workflow showed VAE decode can become a major bottleneck, but current workflow still needs baseline proof |
| RIFE VFI | CPU first until proven | extra compute/memory branch with unverified custom-node support |
| Qwen3_VQA | CPU-only or disabled for the first migration pass | CUDA-biased implementation and not part of the primary video generation hot path |
| resize/aspect helpers | CPU | safer for Lanczos-based image ops |
| VRAM cleanup / memory-queue nodes | do not trust on XPU until source-level audit is complete | current implementations appear CUDA-oriented |

## Workflow-level issues and blockers

1. **The remaining asset gap is narrow but still important.**
   - The original proprietary low-noise filenames are still unresolved and currently covered only by smoke-only compatibility aliases.

2. **Several helper nodes are CUDA-oriented by design.**
   - `LaoLi_Lineup`, `Qwen3_VQA`, and likely cleanup helpers are not safe to assume on XPU.

3. **Current node settings conflict with known Intel XPU migration rules.**
   - `PathchSageAttentionKJ` is set to `auto`, not `disabled`
   - `ModelPatchTorchSettings.enable_fp16_accumulation` is currently `true` in the workflow snapshot inspected

4. **Model path naming is inconsistent.**
   - both `Wan/...` and bare filenames appear
   - batch asset tooling must normalize and stage these consistently

5. **The workflow is multi-branch and cannot be validated with a single happy-path output.**
   - single-image, first-last-frame, and multi-frame branches all need coverage

## Feasibility conclusion

### Current status

**Feasible and partially migrated, but not full-size production-ready on a single 24 GB B60.**

The workflow is not blocked by one single impossible operator. Instead, it has a stack of medium/high-risk items:

- unresolved proprietary low-noise source files
- helper-node behavior that needed source/runtime proof
- a now-proven full-size WAN21 activation OOM on branch `54`

### Recommended migration order

1. resolve custom-node source map and clone/install them into the ComfyUI environment
2. resolve missing model + LoRA source map and extend batch setup tooling
3. produce a CPU-safe / offload-heavy baseline prompt and execution path
4. disable or neutralize known CUDA-biased KJ attention / FP16 settings
5. run branch-level smoke tests for:
   - single-image path
   - first-last-frame path
   - multi-frame-reference path
6. only then begin XPU placement tuning and 24 GB optimization

For this workflow, the first asset-prep automation entry point is:

```bash
bash script_examples/dasiwa_b60_prepare_assets.sh
```

### Planning verdict

- **Go forward** with migration planning and tooling work
- **Do not** claim B60 runtime readiness yet
- treat **asset resolution** and **CUDA-biased helper audit** as the top blockers before any meaningful XPU benchmark
