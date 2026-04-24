# Dasiwa WAN2.2 B60 migration plan

This document turns `workflow_analyse.md` into an implementation plan for migrating the new Dasiwa workflow to **Intel XPU B60 (single-card, 24 GB target)** inside the **ComfyUI** repository.

## Objective

Make `cartoon/DaSiWa-WAN2.2图生视频流-支持单图_双图_三图出视频json.json` runnable and testable on Intel XPU B60 without silently changing workflow semantics.

## Priority order

### P0 — blockers that must be resolved before any credible XPU run

1. **Custom-node source resolution**
   - confirm and install all candidate repos for:
     - `ComfyLiterals`
     - `ComfyUI-Custom-Scripts`
     - `ComfyUI-Easy-Use`
     - `ComfyUI-Frame-Interpolation`
     - `ComfyUI-LaoLi-lineup`
     - `ComfyUI-PainterNodes`
     - `ComfyUI_Qwen3-VL-Instruct`
     - `ComfyUI-Wan22FMLF`
     - `Comfyui_Prompt_Edit`
     - `Comfyui-Memory_Cleanup`
2. **Model + LoRA source resolution**
   - locate or download the missing Wan UNets, `umt5_xxl_fp16`, and all referenced LoRAs
   - search in fixed order: local caches, remote cache, `comfy.icu`, Hugging Face mirror, Civitai, then ModelScope
3. **CUDA-biased helper audit**
   - inspect `LaoLi_Lineup`, cleanup helpers, `Qwen3_VQA`, and RIFE nodes for hardcoded CUDA logic
4. **Safe baseline settings**
   - force `PathchSageAttentionKJ=disabled`
   - force `ModelPatchTorchSettings.enable_fp16_accumulation=false`
   - keep resize/aspect operations on CPU until proven safe on XPU

### P1 — first working migration baseline

1. Produce a **CPU-safe / offload-heavy** execution baseline.
2. Run branch-level smoke tests for:
   - single-image path
   - first-last-frame path
   - multi-frame-reference path
3. Prove output creation for each branch before any tuning.

### P2 — XPU optimization

1. Decide which active-branch models can remain on XPU.
2. Measure:
   - node time
   - branch wall time
   - XPU memory
   - output validity
3. Tune VAE / UNet / interpolation placement only after the baseline is stable.

## Code layout and expected touch points

| Area | Why it likely changes |
| --- | --- |
| `script_examples/workflow_to_prompt.py` | may need workflow-specific conversion coverage as new custom nodes and widget patterns are proven |
| `script_examples/workflow_asset_inventory.py` | already extended for the new workflow; likely needs more model-source coverage |
| `script_examples/workflow_asset_setup.py` | batch setup/download logic for newly resolved repos and models |
| `script_examples/dasiwa_b60_search_models.sh` | workflow-specific source search across local, remote, and public indexes |
| `script_examples/dasiwa_b60_prepare_assets.sh` | workflow-specific wrapper for asset bootstrap |
| `execution.py` | only if new timing/instrumentation is needed for branch debugging |
| `script_examples/workflow_perf_runner.py` / branch runners | branch smoke tests and eventual B60 benchmarking |
| `custom_nodes/*` | local patching may be required where candidate repos are CUDA-only or assume `torch.cuda` |
| `docs/` + `workflow_analyse.md` | final reproducibility and migration hand-off |

## Risk matrix

| Risk | Severity | Why |
| --- | --- | --- |
| Missing UNet / text encoder / LoRA assets | Critical | blocks execution and invalidates memory planning |
| `LaoLi_Lineup` CUDA memory hooks | Critical | likely incompatible with XPU as currently written |
| `Qwen3_VQA` CUDA + bitsandbytes assumptions | Critical | likely not runnable on B60 without fallback or patching |
| `RIFE VFI` package and model support on XPU | High | new compute-heavy branch not validated in prior migration |
| `WanMultiFrameRefToVideo` custom node behavior | High | new workflow-specific generation path |
| `PainterI2V` branch | High | new custom branch logic with unknown model/runtime assumptions |
| `PathchSageAttentionKJ` auto mode | High | known unsafe default from previous migration |
| `enable_fp16_accumulation=true` | High | known XPU migration risk from previous workflow |
| mixed `Wan/...` vs bare filenames | Medium | staging/download confusion rather than runtime logic failure |
| UI/control helper nodes (`ShowText`, `Int`, `Prompt_Edit`) | Low | not expected to block generation directly |

## Unit test plan

### Conversion and asset tooling

1. Extend `workflow_to_prompt` tests for the new workflow patterns when new node types need explicit conversion logic.
2. Extend `workflow_asset_inventory` tests for:
   - `LoraLoaderModelOnly`
   - new custom-node fallback mappings
   - `Wan/...` path normalization
3. Extend `workflow_asset_setup` tests when new model-source mappings are added.

### Runtime compatibility

1. Add focused tests or smoke checks for any custom node patched for XPU:
   - no hardcoded `torch.cuda.*` path when running on XPU
   - no unconditional bitsandbytes dependency for B60 baseline
2. Keep tests small and deterministic; use branch-level prompts rather than full workflow runs for most compatibility checks.

## End-to-end coverage plan

### Scenario matrix

| Scenario | Goal | Minimum proof |
| --- | --- | --- |
| Single-image video path | prove baseline Wan branch works | one valid MP4 output, no missing-node/missing-model errors |
| Dual-image / first-last-frame path | prove temporal conditioning branch works | one valid MP4 output with correct branch wiring |
| Triple-image / multi-frame-ref path | prove `WanMultiFrameRefToVideo` branch works | one valid MP4 output and no branch-specific runtime failure |
| Interpolation path | prove `RIFE VFI` executes or identify exact XPU gap | interpolation output exists or a well-scoped blocker is captured |
| Prompt/VQA helper path | prove helper nodes do not block the main graph | helper execution works on CPU or is isolated as optional |

### Validation checkpoints

For every promoted run:

1. prompt conversion succeeds
2. all referenced models exist
3. all referenced custom nodes load
4. output file exists
5. media metadata is sane
6. logs/history identify the exact failing node if the run aborts

## Deliverables to keep in repo

- `workflow_analyse.md`
- updated asset inventory/setup tooling
- workflow-specific asset bootstrap wrapper
- migration/test-plan docs
- branch smoke-test prompts and reproduction steps
- benchmark/test reports
- deployment guide and E2E reproduction guide

## Immediate next implementation steps

1. install or map the unresolved custom-node repos into the local ComfyUI environment
2. resolve the missing Wan UNet, text encoder, and LoRA source map
3. inspect `LaoLi_Lineup`, cleanup nodes, `Qwen3_VQA`, and `RIFE VFI` for CUDA-only code paths
4. create a first conservative branch smoke-test baseline on B60
