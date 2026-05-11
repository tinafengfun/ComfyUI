# Environment deployment skill

## Use when

Use to create a reproducible Intel XPU ComfyUI baseline.

## Inputs

- ComfyUI checkout
- Python/venv path
- package requirements
- model roots
- custom-node ledger

## Algorithm

1. Freeze repo commits and Python environment.
2. Install dependencies and custom nodes.
3. Configure model roots.
4. Launch with conservative Intel XPU flags.
5. Verify startup and node registration.
6. Preserve logs before moving to prompt validation.

## Common failure signatures

- package imports fail before registration
- node installed after server start but not registered
- wrong model root hides available assets
- startup success misreported as workflow success

## Evidence standard

Retain install log, launch command, startup log, node-registration evidence, and environment summary.

## Hard stops

Stop if ComfyUI cannot start or required nodes cannot register.

## Output schema

`repo_commit`, `venv`, `launch_command`, `model_paths`, `custom_nodes`, `registration_status`, `gaps`.
