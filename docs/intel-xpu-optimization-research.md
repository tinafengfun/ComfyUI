# Intel XPU optimization research notes

This note collects **reusable ComfyUI optimization ideas** for Intel XPU work after a workflow or node package is already functionally correct.

It is not a winner report for one workflow. It is a **candidate catalogue + decision aid**.

Use it together with:

- `intel-xpu-workflow-tuning-skill.md`
- `intel-xpu-workflow-tuning-prompt.md`
- `intel-xpu-workflow-performance-tuning.md`

## Core rule

Do not optimize by folklore.

Always classify an idea as one of:

| Status | Meaning |
| --- | --- |
| `verified` | measured win exists in this repo's retained evidence |
| `plausible` | technically reasonable, but not yet locally proved here |
| `risky` | may help, but can easily regress memory, correctness, or runtime |
| `blocked` | currently unsupported or too CUDA-specific to treat as an active tuning path |

## What the current evidence already proved

### Verified result 1: loader `device=cpu` is not the same as "compute stays on CPU"

For large ComfyUI models under `--lowvram`, setting loaders to `device=cpu` usually means:

1. initial weights live in system RAM
2. ComfyUI moves them to XPU only when the execution stage needs them
3. the runtime can evict them again to keep the XPU budget usable

That means these are often **memory-management controls**, not pure "run on CPU" switches:

- `CLIPLoader`
- `UNETLoader`
- `UnetLoaderGGUF`

**Implication:** do not blindly "move more loaders to XPU" just because CPU placement looks conservative.

### Verified result 2: `--cpu-vae` can be a safe fallback, but not a universal performance default

The retained workflow evidence already showed:

- one Dasiwa-family workflow was **decode-bound**
- removing `--cpu-vae` produced the best measured full-run result
- another workflow was **sampler-bound**, so the same instinct would not have solved the main bottleneck

**Implication:** treat VAE placement as a measured knob, not a doctrine.

### Verified result 3: when sampler stages already dominate, loader tweaks rarely create a full-run win

For the original DaSiwa WAN2.2 case:

- sampler stages consumed about `90%` of node time
- dropping `--lowvram` did not create a meaningful branch win
- enabling default IPEX optimize produced only a tie-sized branch delta and then lost as a full run

**Implication:** if sampler stages dominate, focus on sampler-compatible kernels, step count, branch policy, or capacity limits before chasing small loader changes.

## Optimization catalogue

## 1. Placement and offload controls

### A. CPU-loaded, XPU-executed large models

Examples:

- `CLIPLoader`
- `UNETLoader`
- `UnetLoaderGGUF`

Status: `verified`

When to use:

- 24 GB class XPU target
- multiple large models do not need to stay resident together
- workflow already relies on `--lowvram` or explicit model eviction

Main upside:

- lower residency pressure
- avoids keeping mutually exclusive models pinned on XPU

Main risk:

- extra transfer overhead if the workflow thrashes the same model repeatedly

### B. VAE on XPU after purge / unload

Status: `verified` for decode-bound workflows, otherwise `plausible`

When to try:

- VAE stages consume a meaningful wall-time share
- the workflow already has a cleanup point before decode
- the VAE is small relative to the sampler models

Main upside:

- large decode-speed win when VAE decode is the real bottleneck

Main risk:

- if the sampler state or cache is not really gone, decode can still collide with the memory budget

### C. Full CPU fallback for selected families

Examples:

- Whisper
- SenseVoice
- TripoSR

Status: `verified`

This is not an XPU performance win. It is a **capacity-preserving support path** when the family is useful but XPU-native support is unnecessary or immature.

## 2. Memory-budget shaping

### A. `--lowvram`

Status: `verified`, but workflow-dependent

What it does well:

- constrains residency
- makes large workflows feasible on smaller XPU budgets

What it does not guarantee:

- better wall-clock time
- removal of all lowvram-like runtime behavior after the flag is dropped

Use it when:

- the workflow is near the hardware ceiling
- stage overlap matters more than absolute transfer overhead

### B. Reserve budget / headroom

Examples:

- `--reserve-vram 1.5`

Status: `verified` as a safety mechanism

Use it to:

- preserve allocator headroom
- avoid spending tuning cycles on fragile near-OOM paths

### C. Branch-first prescreens

Status: `verified`

This is not a runtime optimization by itself. It is a **search-cost optimization**:

1. pick one representative output branch
2. reject obviously slower or riskier paths cheaply
3. rerun only credible finalists as full workflows

## 3. Resolution, batching, and chunking controls

### A. Lower branch scope before full-run escalation

Status: `verified`

Use branch-only runs when:

- full-run cost is high
- the workflow has separable outputs
- one branch exposes the same bottleneck class

### B. Frame count / latent count / batch size control

Status: `plausible`

If the workflow semantics allow it, reducing:

- simultaneous frames
- latent batches
- image batch size

can be more effective than chasing micro-optimizations in kernels.

This is only valid when the request explicitly allows that semantic change.

### C. Tiling for encode/decode/upscale/postprocess

Status: `plausible`

Good candidate areas:

- VAE encode/decode
- large image resize / upscale
- segmentation or restoration families that already operate patch-wise

Main upside:

- lower activation peaks

Main risk:

- seams
- extra overhead
- custom-node compatibility gaps

## 4. Precision and quantization

### A. GGUF / low-bit loader variants

Status: `plausible`

Use when:

- the storage format meaningfully reduces staging cost or host memory pressure
- runtime still dequantizes into an acceptable working set

Do not assume:

- a smaller on-disk file means a proportionally smaller runtime footprint

### B. FP16 accumulation / matmul knobs

Status: `risky`

CUDA-side prior art often enables accumulation shortcuts for speed. On Intel XPU, treat this as a hypothesis until all of these are true:

1. the backend exposes an equivalent control
2. the kernel path actually uses it
3. output drift stays acceptable
4. the win survives full-run measurement

### C. Lower-precision runtime paths

Status: `plausible`

Examples to investigate carefully:

- int8 model execution where the upstream library already supports CPU/XPU-friendly inference
- fp16/bf16 placement for stages that fit without forcing spills

## 5. Attention and kernel-path research

### A. CUDA-side prior art that might adapt to XPU

| CUDA-side idea | XPU translation question | Status |
| --- | --- | --- |
| Flash attention / fused attention | can the same workflow benefit from XPU-supported SDPA or Triton-XPU kernels? | `plausible` |
| SageAttention / custom attention patch | is there a Triton-XPU or other Intel-safe implementation path? | `risky` |
| xFormers-style memory-efficient attention | is there an Intel-supported equivalent with the same graph shape? | `blocked` until proven |
| CUDA-only cache / synchronization APIs | can they be removed, abstracted, or replaced with backend-agnostic logic? | `verified` as a migration concern, not yet a tuning win |

### B. When to try kernel-path work

Only escalate here when:

1. sampler or attention-heavy stages dominate wall time
2. safer placement and memory-budget options are already exhausted
3. the workflow is not simply over-budget for the target device

## 6. Stop conditions

Call the problem a **capacity limit**, not a tuning problem, when:

1. the real dominant stage is already compute-dense and highly utilized
2. safer placement changes do not create measurable wins
3. memory headroom is gone even before optional quality knobs
4. the best candidate still exceeds the device budget or loses to the completed baseline

This prevents endless tuning churn on paths that really need:

- a larger XPU
- fewer simultaneous frames
- smaller models
- or explicit CPU fallback

## Suggested execution order

1. measure one full baseline
2. identify the dominant stage by wall-time share
3. classify whether the stage is:
   - placement-limited
   - memory-limited
   - kernel-limited
   - or fundamentally capacity-limited
4. try the safest matching knob first
5. keep only measured winners

## Recommended handoff language

Prefer statements like:

- "CPU-loaded/XPU-executed placement is already the best measured path for these loaders."
- "VAE-on-XPU is a verified win for this decode-bound workflow, not a universal default."
- "This workflow is sampler-bound, so loader tweaks are unlikely to move total runtime much."
- "This family is usable through CPU fallback; that is support, not XPU-native acceleration."
- "The remaining issue is a capacity limit, not a tuning gap."
