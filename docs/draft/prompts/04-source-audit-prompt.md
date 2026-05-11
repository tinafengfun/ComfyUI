# Source audit prompt

## Task

Audit risky workflow and custom-node source paths for Intel XPU compatibility before patching.

## Required context

- workflow inventory
- custom-node ledger
- local source paths
- target Python/PyTorch/IPEX runtime

## Constraints

1. Verify from source code, not guesses.
2. Do not patch unrelated code.
3. Classify each issue before fixing it.
4. Keep CPU fallback and blocked classifications visible.

## Steps

1. Search risky packages for `.cuda()`, `torch.cuda.*`, hard-coded `"cuda"`, CUDA-only extensions, unsupported providers, eager imports, and cleanup APIs.
2. Identify whether each risky node is on a critical path.
3. Classify required change: workflow/runtime policy, ComfyUI core patch, custom-node patch, environment/dependency fix, CPU fallback, or blocked feature work.
4. Record exact source locations and failure signatures.

## Output

Create a source-audit report with:

- package/node family
- risk evidence
- critical-path status
- patch class
- recommended route
- hard-stop or human-decision item

## Hard stops

Stop normal migration if a critical node requires CUDA-only kernels, `.cuda()` architecture, unsupported providers, or major upstream feature development.

## Prior-migration lessons

Some Dasiwa custom nodes needed code patches, some only needed Intel-safe runtime overrides, and some only needed installation. Mixlab showed that import-time side effects and family-level risk must be classified separately.
