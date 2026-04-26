# Intel XPU workflow migration skill

Use this skill when migrating a large ComfyUI workflow to Intel XPU without deleting or bypassing nodes.

## Goal

Deliver a working migration that:

- preserves the full workflow graph
- runs end to end on Intel XPU hardware
- falls back to CPU only where required by compatibility or VRAM pressure
- records every attempt and the reason it succeeded or failed

## Inputs

- workflow JSON
- ComfyUI checkout
- installed custom nodes
- model roots
- XPU target size and runtime constraints

## Non-negotiable rules

1. Do not remove or bypass nodes to get a fake success.
2. Fix failures one node or one branch at a time.
3. Keep the graph structurally identical unless a widget value must change for compatibility.
4. Treat documentation claims as hypotheses until they are verified in code or by runtime evidence.
5. Distinguish between:
   - smoke-success evidence
   - full-fidelity success evidence
   - full-size failure evidence
   and never collapse them into one status label.

## Migration algorithm

### 1. Inventory first

- Count nodes, links, outputs, and node types.
- Extract every model reference from widgets and loader inputs.
- List installed custom node repositories and detect nested repos that the parent project ignores.

### 2. Verify custom-node risk from source, not guesswork

For every “high-risk” custom node:

- read its source implementation
- look for hard-coded `torch.cuda` assumptions
- look for custom attention kernels or unsupported device enums
- decide whether the fix is:
  - a widget setting change
  - a core ComfyUI patch
  - a patch to an external nested custom-node repo

### 3. Make prompt conversion explicit

Convert the workflow JSON to an API prompt and normalize:

- skip display-only nodes
- preserve real dataflow edges
- inject per-loader device defaults when the workflow needs a deliberate CPU/XPU split
- explicitly audit widget-only or half-widget nodes such as `Int`, `Prompt_Edit`, `LaoLi_Lineup`, and `LoraLoaderModelOnly` so API prompts do not silently drop required inputs

### 4. Assess memory before execution

Use static preflight on every referenced model:

- resolve model names
- count parameters where possible
- inspect GGUF quantization types
- estimate projected XPU weight memory

Heuristic that worked here:

- high-compute UNets: prefer XPU only if projection fits the budget
- medium-compute VAE / CLIP Vision: CPU if they threaten XPU headroom
- low-compute text encoders / LoRAs: default to CPU
- if a branch still fails, instrument the real denoise path before assuming the wrong model, wrong conditioning path, or wrong batch shape

### 5. Launch with safe XPU flags

Start with:

- `--disable-ipex-optimize`
- `--lowvram`
- `--cpu-vae`
- `--reserve-vram 1.5`

Do not start by enabling aggressive experimental features.

### 6. Instrument before chasing performance

Always have:

- attempt logging in JSONL
- branch extraction and branch-only execution
- VRAM dashboard or `xpu-smi` sampling
- env-gated model/sampler memory instrumentation when the static estimate and runtime behavior disagree

### 7. Run the smallest faithful test first

Use one output branch and a fixed seed.

Validate:

- node-level prompt validation
- runtime exceptions
- whether the output files are actually produced
- whether the preview PNG and video are non-empty and non-corrupt

### 8. Benchmark placement changes before “optimizing”

Do not assume “more XPU” is faster.

In this migration:

- `ImageResizeKJv2` on GPU failed because Lanczos was unsupported
- resetting `CLIPLoader` and `UNETLoader` from `cpu` to `default` made the benchmark slower, not faster

## Methods tried in this migration

### Methods that worked

- Disable `PathchSageAttentionKJ`
- Disable CUDA-style fp16 accumulation in `ModelPatchTorchSettings`
- Keep VAE on CPU with `--cpu-vae`
- Add explicit `device=cpu` support to core `UNETLoader`
- Add explicit `device=cpu` support to `UnetLoaderGGUF`
- Respect `load_device` and `offload_device` in `comfy/sd.py`
- Use a workflow-to-prompt converter to force loader defaults consistently
- Use branch isolation and attempt logging for repeatable experiments
- Search assets in a fixed order: local caches -> remote cache -> comfy.icu -> Hugging Face -> hf-mirror -> Civitai -> ModelScope
- Stage public assets into `models/` and keep proprietary low-noise aliases explicitly marked as smoke-only compatibility shims
- Treat workflow-side texture/reference files as assets too; missing `LoadImage` inputs can block smoke runs even when all models are present
- Use runtime memory instrumentation to prove the exact failing model, input shape, and free-memory state before changing the diagnosis
- Compare baseline vs `--lowvram` and `--cpu-vae` separately; they solve different problems
- Keep Qwen/VQA and other one-shot preprocess stages CPU-biased unless a measured XPU win is proven

### Methods that failed or were worse

- Treating `last_link_id` as the real number of links
- Assuming GGUF required llama.cpp CUDA kernels
- Assuming `PurgeVRAM V2` itself was hard-coded to `torch.cuda.empty_cache()`
- Switching `ImageResizeKJv2` to GPU with `lanczos`
- Reverting loader devices back to `default` without measuring
- Assuming `LaoLi_Lineup` or generic cleanup nodes would solve the first denoise activation peak
- Assuming `--lowvram` alone fixes a full-size Wan OOM
- Assuming `--cpu-vae` fixes full-size OOM instead of just shifting work earlier to CPU
- Assuming the failing branch was `WAN21_SCAIL` before instrumenting the actual runtime path
- Assuming positive/negative cond batching caused the full-size failure before checking `calc_cond_batch`

## Asset-handling rules that became necessary here

1. Separate **publicly resolved assets** from **compatibility aliases**.
2. A compatibility alias can unlock prompt validation and reduced-resource smoke runs.
3. A compatibility alias does **not** prove output equivalence to the proprietary original.
4. Keep the source gap documented in repo docs and scripts instead of hiding it once the smoke run works.
5. If custom nodes were added or updated after the server was already running, restart ComfyUI before trusting prompt validation failures such as `Node 'Int' not found`.

## Full-size failure triage rule

If both of these are true:

1. runtime instrumentation shows `free + required > total device budget`
2. theoretical active-weight plus activation math also exceeds the budget

then treat the result as a **structural single-card limit**, not as a tuning failure. Escalate to:

- multi-GPU
- model/attention activation reduction
- smaller-generation-plus-postprocess strategy

## Evidence standards

Accept a claim only if it is supported by at least one of:

1. source code inspection
2. prompt validation behavior
3. runtime logs
4. benchmark output
5. generated media and file metadata

## Deliverables

When the migration is done, produce:

- code patches
- a deployment guide
- a JSONL attempt log
- quality notes for generated outputs
- a reusable migration prompt for the next workflow
