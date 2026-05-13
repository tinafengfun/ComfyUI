# Environment deployment skill

## Use when

Use to create a reproducible Intel XPU ComfyUI baseline.

## Inputs

- ComfyUI checkout
- Python/venv path
- package requirements
- model roots
- custom-node ledger
- asset ledger and acquisition log
- source-audit report
- required patch-class table

## Algorithm

1. Freeze repo commits and Python environment.
2. Install ComfyUI dependencies, then prove the accelerator stack:
   - exact `torch`, `torchvision`, and `torchaudio` versions
   - whether the installed wheel is CPU, CUDA, or XPU
   - `torch.xpu.is_available()`
   - XPU device name and total VRAM from both PyTorch and system tools where possible
3. If a generic install pulled CUDA wheels on an XPU host, replace them with matching XPU wheels and re-run the proof. Do not continue with a CUDA build just because imports succeed.
4. Install or symlink custom nodes at recorded commits and record whether they are clean, patched, or dirty.
5. Install dependencies using the source-audit report:
    - install portable import/runtime dependencies needed for target registration
    - include portable runtime dependencies for workflow-selected node classes, even if node registration succeeds without importing them
    - avoid CUDA-only optional accelerators unless explicitly approved
    - record skipped packages, such as `bitsandbytes`, `flash-attn`, `sageattention`, or `onnxruntime-gpu`, and the affected optional paths
6. Configure model roots or symlink staged assets, and retain a source-to-destination mapping.
7. Apply required registration patches or workflow runtime policies, but keep them separate from runtime validation claims.
8. Launch with conservative Intel XPU flags.
9. Verify startup and node registration through `/system_stats` and `/object_info`.
10. Preserve logs and API evidence before moving to prompt validation.

## Environment baseline table

Record actual versions from the target machine. Do not invent versions.

| Component | Required value |
| --- | --- |
| OS / kernel | actual target value |
| GPU model and VRAM | actual target value from system tools |
| GPU driver | actual target value |
| Level Zero / oneAPI runtime | actual target value if installed |
| Python | venv Python version |
| PyTorch | exact package version and XPU build status |
| torchvision / torchaudio | exact package versions and whether they match the PyTorch accelerator build |
| intel-extension-for-pytorch | exact package version if installed |
| ComfyUI | commit SHA |
| Custom nodes | repo URL and commit SHA |
| Launch flags | exact command |
| Node registration | `/object_info` evidence for required node types |
| Model wiring | model root config or symlink map |
| Patch artifacts | files changed, patch path, and claim boundary |

If a version is unknown, write `unknown` and mark it as an environment gap until verified. Do not replace unknowns with guessed "known good" versions.

## Common failure signatures

- package imports fail before registration
- node installed after server start but not registered
- wrong model root hides available assets
- startup success misreported as workflow success
- PyPI or requirements install selects `torch+cu*` on an Intel XPU host
- `torch.xpu` exists but `torch.xpu.is_available()` is false
- ComfyUI starts but reports CPU or CUDA instead of `xpu:0`
- custom-node requirements include CUDA-only optional accelerators that break XPU import or install
- target node registers successfully but later fails during branch smoke because a declared portable runtime dependency was not installed
- optional node import failures obscure whether target workflow nodes registered
- local registration patch is mistaken for full native-XPU runtime support

## Evidence standard

Retain install log, launch command, startup log, `/system_stats`, `/object_info`, node-registration evidence, model-path mapping, patch artifacts, and environment summary.

Registration evidence must name the workflow-critical node types, not just the package folder. A custom-node package can import while a specific node family remains absent.

Dependency evidence must also name workflow-critical node classes. If a package requirements file includes both portable runtime libraries and CUDA-only optional accelerators, record the decision per dependency: installed, skipped as CUDA-only, or intentionally deferred. A node that imports/registers can still fail later if its runtime function imports an undeclared-or-uninstalled helper library.

For local patches applied during environment deployment, record:

1. why the patch was required
2. exact files changed
3. whether the patch is registration-only, runtime-policy, or functional runtime support
4. what still needs branch smoke before promotion

## Hard stops

Stop if ComfyUI cannot start or required nodes cannot register.

Stop if the target is Intel XPU but the environment uses a CUDA/CPU PyTorch build, or if required target nodes are absent from `/object_info`.

## Output schema

`repo_commit`, `venv`, `python`, `torch`, `torchvision`, `torchaudio`, `xpu_available`, `ipex`, `driver`, `level_zero`, `launch_command`, `model_paths`, `custom_nodes`, `registration_status`, `api_evidence`, `patches`, `installed_runtime_dependencies`, `skipped_dependencies`, `deferred_dependencies`, `gaps`.
