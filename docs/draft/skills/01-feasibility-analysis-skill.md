# Feasibility analysis skill

## Use when

Use before any migration work to route the task correctly.

## Inputs

- workflow JSON
- target hardware and VRAM
- expected fidelity
- delivery target
- known model/custom-node constraints

## Algorithm

1. Identify whether the request is workflow migration, package migration, tuning, delivery, or runtime/platform selection.
2. Confirm hardware budget and fidelity.
3. Estimate active model footprint and likely activation peak.
4. Identify obvious CUDA-only or provider-only risks.
5. Classify the task into XPU migration, CPU fallback, environment gap, feature-development gap, or capacity risk.

## Evidence standard

Use workflow structure, model sizes, source hints, and documented target requirements. Do not rely on optimism.

## Hard stops

- non-ComfyUI target
- strict fidelity exceeds hardware
- critical unavailable proprietary asset
- critical CUDA-only runtime with no fallback

## Output schema

`target`, `budget`, `fidelity`, `initial_class`, `risks`, `assumptions_to_verify`, `next_step`.
