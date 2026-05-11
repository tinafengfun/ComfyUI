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

## VRAM estimate template

Use a conservative estimate before running expensive validation:

```text
estimated_peak_vram =
  active_model_weights
  + active_lora_or_adapter_weights
  + activation_peak
  + runtime_workspace
  + safety_margin
```

Guidance:

1. `active_model_weights`: only count weights that must be resident for the active branch at the same time.
2. `activation_peak`: estimate from the heaviest sampler/denoise/video stage, not from VAE or preview nodes.
3. `runtime_workspace`: include attention workspace, decoder workspace, and custom-node temporary tensors when known.
4. `safety_margin`: use at least 10% of device VRAM for smoke and 15-20% for near-production runs.

Do not use this formula as a fake precision tool. Its purpose is routing:

| Estimate vs usable budget | Initial route |
| --- | --- |
| `< 80%` | Normal XPU migration path is plausible. |
| `80-100%` | Continue, but require telemetry early. |
| `100-120%` | Treat as high risk; only proceed if offload or lower-fidelity branch is acceptable. |
| `> 120%` | Prepare capacity-risk or reduced-fidelity plan before runtime work. |

For Dasiwa-style Wan video branches, expect activation peak to dominate once the full denoise path starts. CPU VAE or text-encoder placement may free headroom, but it does not necessarily fix sampler activation pressure.

## Evidence standard

Use workflow structure, model sizes, source hints, and documented target requirements. Do not rely on optimism.

Minimum evidence:

- target XPU model and usable VRAM
- workflow output branches and intended fidelity
- list of large active model files
- rough peak estimate with assumptions
- early source-risk list for critical custom nodes

## Hard stops

- non-ComfyUI target
- strict fidelity exceeds hardware
- critical unavailable proprietary asset
- critical CUDA-only runtime with no fallback

## Output schema

`target`, `budget`, `fidelity`, `estimated_peak_vram`, `initial_class`, `risks`, `assumptions_to_verify`, `next_step`.

## Example from prior work

Dasiwa full-size video generation on a 24 GB-class single XPU stayed in the flow for smoke validation, but the full-size branch later became a capacity hard stop after runtime memory evidence and static reasoning agreed. The feasibility output should therefore say "capacity risk, branch-smoke first" rather than "XPU migration guaranteed".
