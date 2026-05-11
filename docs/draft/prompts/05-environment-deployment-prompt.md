# Environment deployment prompt

## Task

Prepare a reproducible fresh ComfyUI Intel XPU environment for migration validation.

## Required context

- target machine
- ComfyUI repo/commit
- Python version and venv path
- model roots
- custom-node ledger
- required patches

## Constraints

1. Use conservative launch settings before aggressive optimization.
2. Record exact runtime, flags, environment variables, and model paths.
3. Do not treat startup as workflow validation.
4. Verify custom-node registration before prompt validation.

## Steps

1. Create or verify Python venv.
2. Install ComfyUI and required packages.
3. Install custom nodes at recorded commits.
4. Configure `extra_model_paths.yaml`.
5. Apply required patches or workflow runtime policies.
6. Launch with Intel-XPU-safe flags and capture startup logs.
7. Verify node registration.

## Output

Create an environment report with:

- repo/commit
- venv path
- package install notes
- launch command and flags
- model path config
- startup/registration result
- known environment gaps

## Hard stops

Stop if the environment cannot install, import, launch, or register required nodes.

## Prior-migration lessons

Wan package work showed bootstrap and registration are separate evidence levels. Dasiwa GUI delivery showed that a dedicated validation instance and fresh deployment checklist are needed for end-user verification.
