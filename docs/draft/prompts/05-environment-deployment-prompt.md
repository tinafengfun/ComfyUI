# Environment deployment prompt

## Task

Prepare a reproducible fresh ComfyUI Intel XPU environment for migration validation.

## Required context

- target machine
- ComfyUI repo/commit
- Python version and venv path
- model roots
- custom-node ledger
- asset ledger and acquisition log, if staged assets exist
- source-audit report and required patch classes
- required patches

## Constraints

1. Use conservative launch settings before aggressive optimization.
2. Record exact runtime, flags, environment variables, and model paths.
3. Do not treat startup as workflow validation.
4. Verify custom-node registration before prompt validation.
5. Verify that PyTorch is an Intel XPU-capable build. A default PyPI `torch` install may select a CUDA wheel and must not be accepted as an XPU environment.
6. Do not blindly install every custom-node requirement when a source audit identified CUDA-only packages such as `bitsandbytes`, `flash-attn`, `sageattention`, or `onnxruntime-gpu`. Install the minimum portable dependencies needed for startup and target-node registration, and record skipped CUDA-only dependencies.
7. Do not silently change workflow JSON or widget values to make registration easier. Runtime-policy changes must remain explicit.

## Steps

1. Create or verify Python venv.
2. Install ComfyUI dependencies, then verify `torch.__version__`, `torch.xpu.is_available()`, XPU device name, and XPU VRAM. If the installed wheel is CUDA-only, replace it with the correct XPU wheel before proceeding.
3. Install or symlink custom nodes at recorded commits, preserving source provenance and local patch status.
4. Install custom-node dependencies in a source-audit-aware way:
    - prefer portable dependencies required for import and registration
    - include portable runtime dependencies declared by custom nodes used on target branches, not only dependencies needed for `/object_info` registration
    - avoid CUDA-only optional acceleration packages unless explicitly approved
    - record skipped optional dependencies and their impact
5. Configure model roots or symlink staged assets into active ComfyUI model paths. Record source and destination for each model/input path.
6. Apply required registration patches or workflow runtime policies, and record them as patches, not as runtime success.
7. Launch with Intel-XPU-safe flags and capture startup logs.
8. Verify node registration through a machine-readable source such as `/object_info`; do not rely only on "server started".
9. Record actual software and driver versions; use `unknown` rather than guessed versions when a value cannot be verified.

## Output

Create an environment report with:

- repo/commit
- venv path
- Python, PyTorch, IPEX, driver, Level Zero, and GPU details
- package install notes
- launch command and flags
- model path config
- startup/registration result
- API evidence, such as `/system_stats` and `/object_info` excerpts or saved JSON
- local patches applied during environment setup
- CUDA-only dependencies skipped or downgraded to portable alternatives
- target-node runtime dependencies installed or intentionally deferred
- known environment gaps

## Hard stops

Stop if the environment cannot install, import, launch, or register required nodes.

Also stop before prompt validation if:

1. `torch.xpu.is_available()` is false on an XPU target
2. ComfyUI starts on CPU or CUDA instead of the intended XPU device
3. required target nodes are missing from `/object_info`
4. model paths are not visible from the active ComfyUI instance
5. a registration patch is required but not recorded as a patch artifact

## Prior-migration lessons

Wan package work showed bootstrap and registration are separate evidence levels. Dasiwa GUI delivery showed that a dedicated validation instance and fresh deployment checklist are needed for end-user verification.

Zimage showed that default dependency installation can silently install CUDA PyTorch wheels even on an Intel XPU host. Always prove `torch 2.x+xpu` or the intended XPU build and `torch.xpu.is_available() == True` before treating the environment as ready. Zimage also showed that custom-node registration can require a small source patch, but that patch only proves registration readiness; it does not prove full workflow execution or native-XPU support for the node family.

Zimage FLUX2/Klein smoke also showed that registration readiness can miss runtime-only Python dependencies. `ComfyUI-KJNodes` registered, but `ColorMatch` later failed until the declared portable dependency `color-matcher` was installed. During Step 5, inspect requirements against the selected target node classes and record which runtime dependencies were installed, skipped, or deferred to branch smoke.
