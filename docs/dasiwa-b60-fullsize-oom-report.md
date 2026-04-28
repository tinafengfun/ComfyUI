# Dasiwa B60 full-size branch `54` OOM deep-dive

This report summarizes the current investigation into the **full-size** `54` branch failure for the preserved workflow:

- workflow: `cartoon/DaSiWa-WAN2.2图生视频流-支持单图_双图_三图出视频json.json`
- target: **single Intel B60 / 24 GB XPU budget**
- branch: `54`
- full-size test shape: **1024 x 1024**, **81 frames**

The goal is to explain **where the failure happens**, **what is actually causing it**, and **which mitigation paths still look credible**.

## Executive summary

1. **The blocker is no longer dependency-related.**  
   All three preserved output branches validate, and reduced-resource branch smokes already complete on B60/XPU.

2. **The default full-size `54` failure is a real XPU memory peak inside the first Wan denoise pass.**  
   The observed failure is:
   - node: `KSamplerAdvanced` `41`
   - model family at runtime: `WAN21`
   - error: `RuntimeError: level_zero backend failed with error: 39 (UR_RESULT_ERROR_OUT_OF_DEVICE_MEMORY)`
   - throw site: first Wan attention block path in `comfy/ldm/wan/model.py`

3. **The earlier "SCAIL doubles the token sequence" explanation was incorrect for this branch.**  
   Instrumentation shows this path is plain `WAN21` I2V, not `WAN21_SCAIL`. `reference_latent` contributes **one extra reference token block**, not a second full temporal stream.

4. **Positive/negative cond batching is not the cause.**  
   `calc_cond_batch()` already selected `candidate_batch=1`, so the failing full-size pass is not caused by cond/uncond co-batching.

5. **`--lowvram` does not materially change the failing UNet headroom once the run reaches node `41`.**  
   A full-size `--lowvram --disable-smart-memory` run without `--cpu-vae` hits the same pre-UNet free memory and the same OOM site as the baseline.

6. **`--cpu-vae` only moves the bottleneck earlier.**  
   The `--lowvram --disable-smart-memory --cpu-vae` profile avoids the immediate denoise OOM simply because it spends a long time in `PainterI2V -> VAE.encode` on CPU before reaching node `41`.

## Current proven status

### What is already working

The preserved original workflow JSON is unchanged, and the following **reduced-resource** branch smokes complete on B60/XPU:

| Branch | Runtime profile | Result |
| --- | --- | --- |
| `54` | `51.Number=512`, `75.Number=17`, `steps=2` | success |
| `131` | `128.Number=512`, `153.Number=17`, `steps=2` | success |
| `208` | `218.value=512`, `213.Number=17`, `steps=2` | success |

### What is still failing

The **full-size** `54` path at `1024 / 81-frame` still fails on B60/XPU at the first sampler:

- failing node: `41`
- failing node type: `KSamplerAdvanced`
- exception: `UR_RESULT_ERROR_OUT_OF_DEVICE_MEMORY`

## Evidence chain

## 1. The failure is in the first denoise pass, not in model load or prompt preparation

The failing path is:

- `nodes.py -> common_ksampler -> comfy.sample.sample`
- `comfy/samplers.py -> calc_cond_batch -> model.apply_model`
- `comfy/ldm/wan/model.py`

By the time the error is thrown, the run has already completed:

- prompt conversion
- custom-node execution before sampling
- Qwen prompt generation
- text encoding
- latent setup in `PainterI2V`
- UNet loading and patching

So this is a **runtime working-set** failure, not a missing-model or bad-checkpoint failure.

## 2. Instrumentation proves the actual failing input

With `COMFY_MEMORY_DEBUG=1`, the full-size baseline logs:

```text
[memory-debug] calc_cond_batch device=xpu:0 candidate_batch=1 free=13.55GiB required=15.48GiB input_shape=(1, 16, 21, 128, 128) cond_shapes={'c_concat': [(1, 20, 21, 128, 128)], 'c_crossattn': [(1, 512, 4096)], 'reference_latent': [(1, 16, 128, 128)]}
[memory-debug] apply_model model=WAN21 device=xpu:0 input=(1, 36, 21, 128, 128) dtype=torch.float16 context=(1, 512, 4096) extra_conds={'reference_latent': (1, 16, 128, 128)} free=13.48GiB
```

This proves:

- runtime model class is `WAN21`
- sampler input latent is `(1, 16, 21, 128, 128)`
- final UNet input is `(1, 36, 21, 128, 128)`
- `reference_latent` is present as a single `(1, 16, 128, 128)` condition
- free XPU memory at `apply_model` entry is already below the estimator for even one batch

## 3. This branch is not using SCAIL sequence doubling

The actual plain WAN I2V path uses:

- 16 latent channels
- 16 `concat_latent_image` channels
- 4 mask channels

for a total of **36 input channels**.

`PainterI2V` injects `reference_latents` as a list containing one reference frame, and plain `WAN21` handles that reference through `ref_conv`, adding one extra token block after embedding.

That means the approximate token count is:

- main latent tokens: `21 * 64 * 64 = 86,016`
- reference token block: `64 * 64 = 4,096`
- total tokens: **`90,112`**

This is still very large, but it is materially smaller than the earlier incorrect 2x-sequence SCAIL theory.

## 4. Cond batching is already ruled out

The same instrumentation shows:

- `candidate_batch=1`
- `selected_batch=1`

So the current failure is **not** caused by positive and negative conds being concatenated together in the first failing pass.

That removes one of the earlier leading hypotheses.

## 5. The real issue is activation peak, not the tiny tensor at the throw site

The exception is raised when Wan enters the first attention block and attempts a small follow-up allocation. That small tensor is not the real memory hog.

The actual problem is that the model has already assembled a large live working set built from:

1. full 1024x1024 spatial resolution
2. 81-frame input reduced to 21 latent timesteps
3. 90,112-token plain WAN sequence
4. hidden width around the 5k range
5. fp16 runtime compute on XPU

At `L=90,112`, `C=5120`, a single `[B, L, C]` fp16 activation is already about **0.86 GiB**. A Wan block needs multiple tensors of that scale across normalization, attention, projections, and FFN flow, so the live peak quickly exceeds B60 headroom.

## 6. fp8 checkpoints do not stay fp8 at runtime on this XPU path

The workflow loads fp8-format UNets, but on the current XPU stack:

- `unet_manual_cast(torch.float8_e4m3fn, xpu)` resolves to `torch.float16`

So checkpoint storage precision does **not** translate into true fp8 execution savings during the failing denoise path. The important runtime fact is that the UNet enters `apply_model` in **fp16**.

## 7. `--lowvram` does not fix the failing peak

A dedicated full-size run with:

```bash
python main.py \
  --listen 127.0.0.1 \
  --port 8205 \
  --lowvram \
  --disable-smart-memory \
  --database-url sqlite:////home/intel/tianfeng/comfy/ComfyUI/user/comfyui-8205.db
```

still reaches the same point with effectively the same numbers:

```text
loaded partially; 9302.40 MB usable, 9159.98 MB loaded, 4691.84 MB offloaded, 125.03 MB buffer reserved, lowvram patches: 374
[memory-debug] calc_cond_batch ... free=13.55GiB required=15.48GiB ...
[memory-debug] apply_model ... free=13.48GiB
!!! Exception during processing !!! ... UR_RESULT_ERROR_OUT_OF_DEVICE_MEMORY
```

So for this branch:

- lowvram patching is active
- but the first full-size Wan denoise still enters with essentially unchanged free memory
- and the same attention-block OOM remains

This means **generic lowvram residency control is not enough** to solve the peak.

## 8. `--cpu-vae` only shifts the bottleneck to slow preprocessing

Under:

```bash
python main.py \
  --listen 127.0.0.1 \
  --port 8204 \
  --lowvram \
  --disable-smart-memory \
  --cpu-vae \
  --database-url sqlite:////home/intel/tianfeng/comfy/ComfyUI/user/comfyui-8204.db
```

the prompt no longer immediately reproduces the sampler OOM during the observation window. But sampling evidence showed the worker spending time inside:

- `custom_nodes/ComfyUI-PainterNodes/PainterI2V.py`
- `vae.encode(...)`

So this profile does not prove a full-size fix. It mainly trades:

- **XPU peak failure during denoise**

for

- **slow CPU VAE encode before denoise is reached**

## 9. DynamicVRAM is not available on this XPU stack

Even when explicitly forcing:

```bash
python main.py --enable-dynamic-vram ...
```

startup reports:

```text
No working comfy-aimdo install detected. DynamicVRAM support disabled. Falling back to legacy ModelPatcher.
```

So the main CUDA-side escape hatch for more aggressive dynamic residency is currently unavailable here.

## 10. Theoretical memory budget confirms the run is over 24 GB

Using the measured checkpoint sizes, observed runtime shapes, and the plain WAN21 I2V structure:

- low-noise UNet params: **20.10B**
- hidden dim: **5120**
- FFN dim: **13824**
- layers: **40**
- full-size sequence length: **90,112 tokens**

the important memory terms are:

| Component | Estimate |
| --- | ---: |
| low-noise UNet weights | **37.44 GiB** at fp16, **18.72 GiB** at fp8-ish storage |
| main `[B, L, C]` activation | **0.86 GiB** |
| `q + k + v` activations | **2.58 GiB** |
| FFN hidden `[B, L, 13824]` | **2.32 GiB** |
| one-block activation envelope | **5.79 - 7.51 GiB** |
| `PainterI2V` 81-frame image buffer | **0.95 GiB** on CPU/intermediate path |

That gives two independent reasons the single-card run is not comfortable on a 24 GB B60:

1. **The runtime estimator already crosses device capacity**  
   At `apply_model` entry:
   - free memory: **13.48 GiB**
   - required memory: **15.48 GiB**
   - implied peak: about **24.71 GiB**

2. **Theoretical UNet + activation math also crosses capacity**  
   Even if the low-noise UNet residency stayed near fp8-style storage cost, a realistic first-block peak is still roughly:
   - **18.72 GiB** weights
   - plus **5.79 - 7.51 GiB** block activations
   - for about **24.5 - 26.2 GiB**

So the present full-size path is not merely "fragile" on 24 GB; it is **structurally above the budget**.

## 11. What CPU offload can help, and what it cannot

The following components are reasonable CPU-offload targets because they are not the dominant denoise activation cost:

| Component | CPU offload value | Helps this OOM? |
| --- | --- | --- |
| text encoder (`umt5_xxl`) | large static VRAM saver; one-shot encode | **Yes, but it is already on CPU in this workflow** |
| Qwen3_VQA prompt generation | one-shot preprocess stage | **Yes for general hygiene, not decisive for node `41`** |
| VAE encode/decode | can free model residency on XPU | **Partially; reduces static pressure but does not remove the Wan denoise peak** |
| CLIP vision / other preprocessors | small-to-moderate residency saver | **Minor help only** |
| RIFE / postprocess stages | should stay off XPU until needed | **Not relevant to the first OOM point** |

The following are **not** meaningfully solved by generic CPU offload:

- the active low-noise WAN21 UNet for node `41`
- the first attention-block activations inside that UNet
- the first full-size FFN working set

This is why `--cpu-vae` changes behavior but does not prove a fix: it moves work earlier onto CPU, while the decisive full-size Wan activation peak remains waiting later in sampler `41`.

## Root-cause assessment

### Final root cause

The full-size `54` blocker on B60/XPU is:

> **plain WAN21 I2V activation peak at the first full-size denoise step exceeds available XPU headroom on the current Intel XPU runtime path**

More specifically:

1. the run reaches node `41` with only about **13.48 GiB** free
2. the runtime's own estimate for a single batch is already about **15.48 GiB**
3. the model enters `apply_model` with a large fp16 sequence (`90,112` tokens at hidden width `5120`)
4. the first attention block pushes the live working set over device limits and the next allocation trips OOM

### What has now been ruled out

- not a missing node
- not a missing model
- not a bad LoRA load
- not SCAIL token doubling
- not cond/uncond co-batching
- not something uniquely fixed by generic `--lowvram`
- not a simple XPU-wide switch from default PyTorch attention to `sub_quad`

## 12. Experimental XPU `sub_quad` attention override did not unblock full-size `54`

An additional experiment forced an XPU-side attention override to try a lower-peak attention path during the failing full-size run:

```bash
COMFY_XPU_FORCE_SUB_QUAD=1 \
COMFY_MEMORY_DEBUG=1 \
python main.py \
  --listen 127.0.0.1 \
  --port 8211 \
  --lowvram \
  --disable-smart-memory \
  --database-url sqlite:////home/intel/tianfeng/comfy/ComfyUI/user/comfyui-8211.db
```

The branch was then resubmitted with the preserved full-size prompt at output node `54`.

### Result

- the run still failed on XPU
- the failure did **not** reach a stable first-block success
- the throw site moved earlier to Wan block entry setup:

```text
File "comfy/ldm/wan/model.py", line 243, in forward
  e = (cast_to(self.modulation, dtype=x.dtype, device=x.device).unsqueeze(0) + e).unbind(2)
RuntimeError: level_zero backend failed with error: 39 (UR_RESULT_ERROR_OUT_OF_DEVICE_MEMORY)
```

Cleanup then cascaded into:

```text
RuntimeError: level_zero backend failed with error: 20 (UR_RESULT_ERROR_DEVICE_LOST)
```

### Interpretation

This does **not** prove that every possible Wan attention/backend rewrite is useless. It does prove that:

1. a simple XPU-wide fallback from default PyTorch attention to `sub_quad`
2. under the same full-size `1024 / 81-frame` workload
3. on the current B60 / Intel XPU stack

is **not enough** to make branch `54` viable.

Retained logs for this experiment live under:

- `docs/artifacts/b70/subquad-experiment/logs/server-8211.log`
- `docs/artifacts/b70/subquad-experiment/logs/branch-54-submit.log`

## Strategy options

## Strategy A — keep reduced-resource smoke as the stable migration baseline

### Value

- already proven on B60/XPU
- preserves the original workflow JSON
- good for repeatable branch regression coverage

### Limitation

- not a full-size success claim

## Strategy B — treat small-resolution plus post-process as the realistic 24 GB path

### What it means

Use lower generation resolution / shorter latent length for generation, then rely on:

- VAE decode
- interpolation already present in the workflow
- optional post-upscale or downstream enhancement

### Why it still fits the user request

This preserves workflow semantics and aligns with a practical diffusion-memory strategy: reduce the expensive denoise stage, then spend cheaper compute afterward.

### Limitation

- this is a workflow-tier deployment strategy, not a true full-size root-cause fix

## Strategy C — pursue true activation reduction inside WAN, not generic lowvram

### Candidate directions

1. sequence or block chunking inside Wan attention / FFN
2. attention backend changes that materially lower live activation footprint on XPU
3. model-level tiled or streamed execution for the first denoise pass

### Why it matters

The evidence now says the dominant problem is **activation peak inside the model**, not static residency alone.

### Limitation

- requires real model/runtime engineering
- highest implementation risk

## Strategy D — enable a lower-precision compute path that actually survives on XPU

### Candidate directions

1. validate whether more of the path can stay bf16 instead of fp16 where safe
2. investigate whether Intel XPU kernels can support true fp8-style execution savings for this Wan path
3. compare against CUDA-side memory-saving implementations for transferable ideas, but only keep changes that are valid on XPU

### Why it matters

The current "fp8 checkpoint" story does not help enough because runtime manual-cast lands in fp16 anyway.

### Limitation

- backend support may be missing
- may require upstream PyTorch / IPEX / Comfy work rather than a local patch only

## Strategy E — improve XPU-specific model residency policy only if it changes actual entry headroom

### Candidate directions

1. stronger offload before `41`
2. more aggressive unload of non-active model state
3. XPU-compatible DynamicVRAM-equivalent support

### Why this is secondary

`--lowvram` already shows that generic partial loading alone does not change the decisive `apply_model` headroom enough. Residency work is only worthwhile if it demonstrably increases free memory before the first WAN block.

## Strategy F — use CPU offload selectively, but do not expect it to solve full-size by itself

### Good CPU-offload targets

1. keep text encoding on CPU
2. keep Qwen/VQA preprocessing off the XPU fast path
3. offload VAE except when actively encoding/decoding
4. keep postprocess models unloaded until after sampler `42`

### Why this is not sufficient

These steps improve flexibility and reduce avoidable residency pressure, but the proven blocker is still the **active WAN21 denoise peak**. They are worthwhile as supporting policy, not as the primary full-size solution.

## Recommended next steps

1. **Report the root cause as converged.**  
   The remaining issue is no longer diagnosis; it is choosing whether to pursue a full-size engineering fix or to formalize a reduced-generation-plus-postprocess deployment tier for 24 GB B60.

2. **Do not invest more time in cond-batching or SCAIL-specific fixes for this branch.**  
   The current evidence has ruled those out.

3. **If full-size on 24 GB remains mandatory, focus new experiments on activation-reduction paths only.**  
   Generic lowvram and CPU-VAE do not address the decisive peak.

4. **Use CPU offload for the light stages, but do not count it as the main fix.**

5. **Keep the current smoke tier as the reproducible migration success baseline.**  
   That is already solid and GitHub-ready.

## Bottom line

The current evidence supports this conclusion:

- **The full-size blocker is a real plain-WAN21 activation OOM on Intel XPU, not a dependency problem**
- **The branch reaches `apply_model` already under-provisioned for a single full-size batch**
- **Neither SCAIL token doubling nor cond batching explains the failure**
- **Generic lowvram does not materially improve the decisive headroom**
- **The realistic next choice is either activation-level engineering or a smaller-generation-plus-postprocess production strategy**
