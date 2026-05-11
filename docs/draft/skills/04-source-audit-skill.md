# Source audit skill

## Use when

Use before patching custom nodes or declaring XPU support.

## Inputs

- custom-node source paths
- workflow critical-path list
- environment details

## Algorithm

1. Search source for `.cuda()`, `torch.cuda.*`, hard-coded `cuda`, native CUDA extensions, provider assumptions, and eager imports.
2. Link each risk to workflow criticality.
3. Classify the patch type.
4. Decide whether to patch, keep CPU fallback, mark integration gap, or mark feature-development gap.

## Common failure signatures

- CUDA cleanup API called on non-CUDA runtime
- GPU-only ONNX/provider assumption
- eager import breaks ComfyUI startup
- custom kernel unavailable on XPU

## Evidence standard

Retain file/line references, tracebacks, import logs, and patch-class table.

## Hard stops

Stop normal migration if the critical path requires unsupported CUDA-only architecture.

## Output schema

`node_family`, `source_path`, `risk`, `critical_path`, `patch_class`, `recommended_route`, `evidence`.
