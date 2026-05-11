# Source audit skill

## Use when

Use before patching custom nodes or declaring XPU support.

## Inputs

- custom-node source paths
- workflow critical-path list
- environment details

## Algorithm

1. Search source for `.cuda()`, `torch.cuda.*`, hard-coded `cuda`, native CUDA extensions, provider assumptions, and eager imports.
2. Check Intel XPU-specific risk:
   - whether the code has an equivalent `torch.xpu` path or uses generic `torch.device`
   - whether `ipex.optimize()` is assumed, required, harmful, or irrelevant for the model path
   - whether attention uses Flash Attention, SageAttention, SDP settings, or custom kernels that must be disabled or replaced on XPU
   - whether dtype choices are safe for the target XPU class; do not assume `fp16` and `bf16` behave the same on every Intel GPU
   - whether ONNX Runtime providers are hard-coded to CUDA-only providers instead of OpenVINO, DML, CPU, or another validated provider
   - whether the installed PyTorch, IPEX, Level Zero, and driver versions are compatible with the expected `torch.xpu` behavior
3. Link each risk to workflow criticality.
4. Classify the patch type.
5. Decide whether to patch, keep CPU fallback, mark integration gap, or mark feature-development gap.

## Common failure signatures

- CUDA cleanup API called on non-CUDA runtime
- GPU-only ONNX/provider assumption
- eager import breaks ComfyUI startup
- custom kernel unavailable on XPU
- attention optimization node assumes NVIDIA-only backend
- dtype path works on CPU/CUDA but fails or regresses on XPU
- package imports successfully but one node family still uses CUDA-only runtime

## Evidence standard

Retain file/line references, tracebacks, import logs, and patch-class table.

For every high-risk item, include:

- exact source path and line or function
- critical-path status
- observed or expected failure signature
- target route: XPU patch, runtime policy override, CPU fallback, environment gap, or feature-development gap
- validation needed before promotion

## Compatibility evidence table

Record actual compatibility evidence. Do not fill this table with guessed support.

| Area | What to record | Allowed value when unknown |
| --- | --- | --- |
| PyTorch XPU | exact `torch` version and whether `torch.xpu.is_available()` was observed | `unknown; verify in environment step` |
| IPEX | exact `intel_extension_for_pytorch` version and whether it is used by this code path | `not installed` or `unknown` |
| Attention backend | actual backend used by the node or workflow policy | `unknown; source audit required` |
| ONNX provider | provider requested by source and provider available in runtime | `unknown; provider validation required` |
| Dtype | dtype requested by source and dtype validated on target hardware | `unknown; runtime validation required` |
| Driver/runtime | driver, Level Zero, and oneAPI runtime observed on target | `unknown; environment gap` |

## Hard stops

Stop normal migration if the critical path requires unsupported CUDA-only architecture.

## Output schema

`node_family`, `source_path`, `risk`, `xpu_specific_risk`, `critical_path`, `patch_class`, `recommended_route`, `evidence`, `validation_needed`.
