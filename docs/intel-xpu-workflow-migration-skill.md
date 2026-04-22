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

### Methods that failed or were worse

- Treating `last_link_id` as the real number of links
- Assuming GGUF required llama.cpp CUDA kernels
- Assuming `PurgeVRAM V2` itself was hard-coded to `torch.cuda.empty_cache()`
- Switching `ImageResizeKJv2` to GPU with `lanczos`
- Reverting loader devices back to `default` without measuring

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
