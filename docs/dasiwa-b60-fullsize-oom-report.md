# Dasiwa B60 full-size branch `54` OOM deep-dive

This report summarizes the current investigation into the **full-size** `54` branch failure for the preserved workflow:

- workflow: `cartoon/DaSiWa-WAN2.2图生视频流-支持单图_双图_三图出视频json.json`
- target: **single Intel B60 / 24 GB XPU budget**
- branch: `54`
- full-size test shape: **1024 x 1024**, **81 frames**

The goal is to explain **where the failure happens**, **what is most likely causing it**, and **what strategies are available** to address it.

## Executive summary

1. **The failure is no longer a missing-node or missing-model problem.**  
   The workflow can now run branch-level smokes for all three outputs on B60/XPU, and branch `54` validates and executes correctly at reduced scale.

2. **The default full-size `54` failure is a real memory-pressure issue inside the first Wan sampling pass.**  
   The observed failure is:
   - node: `KSamplerAdvanced` `41`
   - error: `RuntimeError: level_zero backend failed with error: 39 (UR_RESULT_ERROR_OUT_OF_DEVICE_MEMORY)`
   - throw site: `comfy/ldm/wan/model.py`, first attention block modulation cast

3. **The throw site is not the true root cause by itself.**  
   The failing allocation is only a tiny modulation tensor. It is the first allocation that happens **after** the model has already built a very large full-size attention context. The real issue is the **combined peak** from:
   - full 1024/81 sequence size
   - SCAIL/Wan reference-latent conditioning
   - positive/negative conditioning batching
   - two-sampler / two-UNet branch structure

4. **A lowvram / CPU-VAE server profile materially improves the situation.**  
   A separate server started with:

   ```bash
   python main.py \
     --listen 127.0.0.1 \
     --port 8201 \
     --lowvram \
     --disable-smart-memory \
     --cpu-vae \
     --database-url sqlite:////home/intel/tianfeng/comfy/ComfyUI/user/comfyui-8201.db
   ```

   avoids the immediate default-profile OOM and reaches live execution past `Qwen3_VQA`, text-encoder load, and CPU-VAE load at full size, but it still did **not** complete within the current investigation window.

## Current proven status

### What is already working

The preserved original workflow JSON is unchanged, and the following **reduced-resource** branch smokes complete on B60/XPU:

| Branch | Runtime profile | Result |
| --- | --- | --- |
| `54` | `51.Number=512`, `75.Number=17`, `steps=2` | success |
| `131` | `128.Number=512`, `153.Number=17`, `steps=2` | success |
| `208` | `218.value=512`, `213.Number=17`, `steps=2` | success |

### What is still failing

The **default** full-size `54` path at `1024 / 81-frame` still fails on B60/XPU with:

- prompt id: `452a6e66-155c-4147-ba6a-7e9806bec8b1`
- failing node: `41`
- failing node type: `KSamplerAdvanced`
- exception: `UR_RESULT_ERROR_OUT_OF_DEVICE_MEMORY`

## Evidence chain

## 1. The failure occurs in the first Wan sampling pass, not during model file load

The default failure is reported from:

- `nodes.py -> common_ksampler -> comfy.sample.sample`
- `comfy/samplers.py -> calc_cond_batch -> model.apply_model`
- `comfy/ldm/wan/model.py`

The exception is raised at:

```python
e = (comfy.model_management.cast_to(self.modulation, dtype=x.dtype, device=x.device).unsqueeze(0) + e).unbind(2)
```

This means the run already made it through:

- prompt conversion
- custom-node execution before sampling
- UNet file deserialization
- text encoding
- VAE preparation

The failure happens when the model is already entering the **first transformer block** of the full-size Wan denoising pass.

## 2. The failing tensor itself is tiny

The modulation tensor at the throw site is not large enough to explain the failure on its own:

| Dim | fp32 | bf16/fp16 |
| --- | ---: | ---: |
| `5120` | ~0.117 MiB | ~0.059 MiB |
| `6656` | ~0.152 MiB | ~0.076 MiB |

So the failure is best interpreted as:

> **the first small allocation that happens after the peak working set has already consumed the remaining XPU headroom**

not:

> the modulation tensor itself is the true memory hog

## 3. `54` is much larger than the reduced smoke path

The input image for branch `54` is already:

- `1024 x 1024`

`PainterI2V` then constructs:

```python
latent = torch.zeros([batch_size, 16, ((length - 1) // 4) + 1, height // 8, width // 8], ...)
```

At full-size `54`:

- `length = 81`
- latent temporal length = `((81 - 1) // 4) + 1 = 21`
- latent spatial size = `128 x 128`

So the branch runs on a main latent shaped approximately:

- `1 x 16 x 21 x 128 x 128`

That raw latent tensor is small by itself, but `PainterI2V` also builds a full 81-frame image sequence for VAE encoding and injects additional conditions:

- `concat_latent_image`
- `concat_mask`
- `reference_latents`

## 4. SCAIL/Wan explicitly enlarges the sequence with reference latents

For this branch, ComfyUI resolves the model family to `WAN21_SCAIL`, which uses `SCAILWanModel`.

Relevant code paths:

- `comfy/model_base.py`
  - `WAN21_SCAIL.memory_usage_factor_conds = ("reference_latent", "pose_latents")`
- `comfy/ldm/wan/model.py`
  - `SCAILWanModel.forward_orig()` concatenates `reference_latent` into the model input time dimension before patch embedding

That means the model is not only processing the main denoising latent. It also extends the sequence with reference conditioning before attention.

## 5. The attention sequence is very large at full size

`WanModel` uses:

- patch size: `(1, 2, 2)`
- hidden dim for `SCAILWanModel`: `5120`

For the main latent:

- temporal patches: `21`
- spatial patches: `128 / 2 = 64`, `128 / 2 = 64`
- main tokens: `21 * 64 * 64 = 86,016`

The reference latent is also compressed on the same latent grid and concatenated, so the total sequence is roughly:

- main tokens: `86,016`
- reference tokens: `86,016`
- **total tokens: `172,032`**

Even a single bf16 activation with that sequence is large:

| Tensor view | Approx size |
| --- | ---: |
| one `[B, L, C]` at `L=172,032`, `C=5120`, bf16 | ~1.64 GiB |
| one `[B, L, C]` at `L=172,032`, `C=5120`, fp32 | ~3.28 GiB |

The Wan attention block creates several such intermediate tensors across:

- normalization
- self-attention
- cross-attention
- FFN
- per-block modulation

so the true live working set is much larger than a single tensor.

## 6. Positive/negative conditioning batching likely amplifies the peak

`comfy/samplers.py::_calc_cond_batch()` tries to batch compatible conds together:

```python
input_x = torch.cat(input_x)
...
output = model.apply_model(input_x, timestep_, **c).chunk(batch_chunks)
```

For `KSamplerAdvanced`, this commonly means **positive + negative** conditioning get processed together when the estimator thinks it is safe.

If both branches are batched together, the rough bf16 activation impact of the 172k-token sequence doubles again:

- one cond batch: ~`1.64 GiB`
- positive + negative together: ~`3.28 GiB`

This is a strong candidate for why the failure appears right as the first attention block starts.

## 7. The default profile also has multi-model residency pressure

Branch `54` is not a single-UNet pipeline:

- `41` samples with model `295`
- `42` samples with model `296`
- both are derived from separate `UNETLoader + LoRA` stacks

So before the first sampler has fully finished, the branch graph already contains:

- low-noise UNet path
- high-noise UNet path
- LoRAs for both paths
- text encoder state
- VAE state
- generated conditioning tensors

In the default profile, this makes it much easier to run out of headroom before the first full-size denoising step settles.

## Root-cause assessment

### Most likely primary cause

The **primary cause** is the **peak activation and condition working set** of full-size branch `54`, not a bad file or a single broken node.

The memory spike is driven by the combination of:

1. full spatial resolution: `1024 x 1024`
2. long sequence length: `81` frames
3. temporal latent length: `21`
4. SCAIL reference-latent concatenation, which roughly doubles token count
5. positive/negative batching during `calc_cond_batch`
6. default-profile coexistence of two UNet branches in the same prompt

### Why the error appears at `cast_to(self.modulation, ...)`

That call is the first small XPU allocation inside the first attention block after the model has already assembled:

- patch-embedded sequence
- RoPE embeddings
- text/image conditioning
- reference-latent-expanded token stream

So the exception location is best read as:

> **first post-assembly allocation after the real peak has already been reached**

not:

> **the modulation parameter itself is too large**

## What the lowvram trial tells us

The clean lowvram server profile:

- `--lowvram`
- `--disable-smart-memory`
- `--cpu-vae`
- separate `--database-url`

changes the behavior materially:

1. the immediate default-profile OOM signature disappears
2. the run reaches at least:
   - `Qwen3_VQA`
   - text encoder load
   - CPU-VAE load
3. the full-size branch still does not finish within the current investigation window

That suggests:

- the default-profile failure is **not** an unavoidable hard limit at file-load time
- **more aggressive offload / better scheduling helps**
- but the current runtime still does not have a proven full-size completion path on B60

## Strategy options

## Strategy A — keep the current reduced-resource smoke profile

### What it does

Use the already-proven:

- `512`
- `17 frames`
- `steps=2`

branch smokes as the repeatable migration baseline.

### Value

- lowest risk
- already proven
- preserves the original workflow JSON
- best current status for CI/regression coverage

### Limitation

- not full-size
- not enough for a final “production-ready on 24 GB” claim

## Strategy B — promote lowvram / CPU-VAE as the baseline full-size experiment

### What it does

Run full-size trials only under:

- `--lowvram`
- `--disable-smart-memory`
- `--cpu-vae`
- separate `--database-url`

### Value

- clearly better than the default profile
- avoids the immediate OOM seen on the default server
- requires no workflow JSON edits

### Limitation

- still not proven to complete
- likely much slower

## Strategy C — reduce sampler batching pressure

### What it targets

The likely positive/negative concat in `calc_cond_batch()`.

### Candidate actions

1. disable or reduce cond batching for the full-size WAN21_SCAIL path
2. make the memory estimator more conservative for `WAN21_SCAIL`
3. ensure positive/negative are processed separately when `reference_latent` is present at large sequence sizes

### Why it helps

If positive and negative are currently running together, splitting them removes one major peak multiplier.

### Cost

- requires code change in sampler/runtime policy
- needs careful validation because it affects scheduler behavior and performance

## Strategy D — force stronger model residency separation between `41` and `42`

### What it targets

The two-UNet two-sampler structure inside branch `54`.

### Candidate actions

1. unload or offload model `296` before `41` begins
2. reload `296` only when `42` starts
3. avoid keeping both high-noise and low-noise branches resident at once under the default profile

### Why it helps

This attacks the static residency part of the peak, which lowvram already suggests is important.

### Cost

- requires runtime/policy work rather than workflow edits
- may increase wall-clock time

## Strategy E — improve SCAIL-specific memory estimation

### What it targets

`WAN21_SCAIL.memory_usage_factor_conds = ("reference_latent", "pose_latents")` exists already, but the current estimator may still be too optimistic for the real transformer token explosion.

### Candidate actions

1. increase the SCAIL `memory_usage_factor`
2. add a custom `memory_usage_shape_process` for `reference_latent`
3. make `calc_cond_batch()` reject larger concatenated batches earlier for SCAIL

### Why it helps

This is the most targeted way to stop the runtime from attempting a batch layout that is unrealistic on 24 GB B60.

### Cost

- code change
- requires retesting on both reduced and full-size runs

## Strategy F — reduce workflow-scale requirements only for validation tiers

### What it does

Keep:

- reduced-size smoke
- medium-size validation
- full-size stress trials

as three separate test tiers.

### Value

- gives management a clean story
- preserves reproducible branch coverage
- acknowledges that full-size and full-fidelity validation are not yet the same thing on B60

### Limitation

- does not solve full-size completion by itself

## Recommended next steps

### Highest-value next step

**Implement Strategy C + Strategy E together**:

1. make `WAN21_SCAIL` memory estimation more conservative
2. prevent aggressive positive/negative batching when large `reference_latent` conditions are present

This is the most plausible way to turn the current lowvram “gets much further” behavior into an actually completing full-size run.

### Second priority

**Implement Strategy D**:

Add explicit model residency/offload control between `41` and `42` so the branch does not pay for both UNet stacks at the same time unless necessary.

### Operational recommendation for status reporting now

Use the following message:

> The Dasiwa workflow is now reproducibly runnable on Intel B60/XPU in preserved-workflow smoke mode for all three output branches. The remaining blocker is full-size branch `54` at `1024 / 81-frame` scale, where the failure is now understood as a real peak-memory problem in the first SCAIL/Wan denoising pass rather than a missing dependency problem. A lowvram/cpu-vae runtime profile materially improves progress, but full-size completion still needs runtime-level memory-policy work before we can claim production-readiness on a 24 GB B60.

## Bottom line

The current evidence supports this conclusion:

- **The OOM is caused by full-size SCAIL/Wan runtime memory pressure, not by a broken node or bad model file**
- **The most likely peak contributors are token explosion from full-size reference-conditioned attention and positive/negative batch co-execution**
- **The best immediate path forward is runtime memory-policy work, not more asset search**
