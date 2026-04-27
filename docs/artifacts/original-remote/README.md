# Original Dasiwa workflow remote package

This package records the remote Intel XPU validation for:

- workflow: `cartoon/DaSiWa-WAN2.2图生视频流-支持单图_双图_三图出视频json.json`
- remote checkout: `/home/intel/tianfeng-b70/ComfyUI`
- server: `127.0.0.1:8191`
- target outputs: `54`, `131`, `208`

## Status summary

| Branch | Status | Notes |
| --- | --- | --- |
| `54` | success after fix | required prompt-export fix for `LoraLoaderModelOnly` selector normalization |
| `131` | success | smoke run produced png/mp4 |
| `208` | success | smoke run produced png/mp4 |

## Asset inventory

### Core model assets

| Type | Workflow reference | Published state | Notes |
| --- | --- | --- | --- |
| high-noise UNet | `wan2.2_i2v_A14b_high_noise_scaled_fp8_e4m3_lightx2v_4step_comfyui.safetensors` | shared-root resolved | served from `/home/intel/lucas/weights/models` via `extra_model_paths.yaml` |
| low-noise UNet | `wan22I2VLLSDasiwaNm.low.safetensors` | shared-root resolved | available in shared root |
| low-noise UNet alias | `dasiwaWAN22I2V14B_radiantcrushLow.safetensors` | smoke-only compatibility alias | mapped to the available low-noise WAN weight for preserved-workflow smoke validation |
| text encoder | `umt5_xxl_fp16.safetensors` | shared-root resolved | loader path normalized during prompt export |
| VAE | `wan_2.1_vae.safetensors` | shared-root resolved | |
| LoRA | `Wan2.2-Fun-A14B-InP-low-noise-HPS2.1.safetensors` | shared-root resolved | |
| LoRA | `Wan2.2-Fun-A14B-InP-high-noise-MPS.safetensors` | shared-root resolved | |
| LoRA | `lightx2v_I2V_14B_480p_cfg_step_distill_rank256_bf16.safetensors` | shared-root resolved | |

### Auxiliary runtime assets

| Type | Asset | Published state | Notes |
| --- | --- | --- | --- |
| prompt-generator model | `Qwen3-VL-4B-Instruct` | isolated-checkout resolved | kept under remote checkout `models/prompt_generator/` because shared root was not writable |
| prompt-generator model | `Qwen3-VL-4B-Instruct-FP8` | isolated-checkout resolved | same reason as above |
| frame interpolation checkpoint | `rife47.pth` | custom-node resolved | provided by `ComfyUI-Frame-Interpolation` custom node |

### Workflow-side input images

| Node | File |
| --- | --- |
| `73` | `74183b15ad77b23879693ee598e7c829.jpg` |
| `155` | `5b91eb1d97d93b035c50e7c8dd06ce6505482685bf3efc1faa2b34086cb47ad6.png` |
| `156` | `fd58009a5996be7eca0ebd9d07aaeae993215afc92585c235d6474b520f612ef.png` |
| `215` | `7ca01a9571891af904332232d83d3dca68bc9dee109be5606f7476f53859624d.jpg` |
| `216` | `eb635abe438eca7a01f0cdff92c3f87cb765c98ac1800596d595ea5cc19b3008.jpg` |
| `217` | `aaa5571069522d7606a152e5597c0d9b65881928bb939fd328339b297b8a805f.jpg` |

## Published evidence

### Logs

- `logs/branch-54-smoke.log`
- `logs/branch-54-smoke-fix.log`
- `logs/branch-131-smoke.log`
- `logs/branch-208-smoke.log`

### Prompt snapshots

- `prompts/branch-54-smoke.json`
- `prompts/branch-54-smoke-fix.json`
- `prompts/branch-131-smoke.json`
- `prompts/branch-208-smoke.json`

### Generated media included in Git

- `generated/dasiwa-original-smoke-o54-fix_00001.png`
- `generated/dasiwa-original-smoke-o131_00001.png`
- `generated/dasiwa-original-smoke-o208_00001.png`

## Media publication policy

MP4 files are intentionally **excluded from Git publication**.

They may still exist in local or remote work directories for review, but the published repository keeps:

1. logs
2. prompt snapshots
3. png outputs
4. patch artifacts
5. deployment and migration documentation

## Related fixes

- prompt-export fix patch: `patches/dasiwa-b70/ComfyUI-original-branch54-fix.patch`
- reusable release standard: `docs/intel-xpu-workflow-release-standard.md`
