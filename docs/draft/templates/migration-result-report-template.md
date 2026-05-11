# {Workflow Name} Intel XPU migration result

## Executive summary

| Field | Value |
| --- | --- |
| Result class | Intel-XPU migrated / CPU fallback / environment gap / feature-development gap / capacity hard stop |
| Target hardware | GPU model, total VRAM, measured usable VRAM; see `intel-xpu-hardware-reference.md` |
| Validation level | Prompt validation / branch smoke / full-size / customer GUI |
| Workflow preserved | Yes / No, with reason |
| Customer-ready | Yes / No, with evidence |

## Scope

- Workflow JSON:
- ComfyUI commit:
- Custom-node commits:
- Model roots:
- Output branches:

## Branch coverage matrix

| Branch / output node | Intended output | Validation level | Result | Evidence |
| --- | --- | --- | --- | --- |
| | | | | |

## Node coverage matrix

| Node ID | Node type | Runtime role | Evidence source | Status |
| --- | --- | --- | --- | --- |
| | | | | |

## Asset state

| Requested asset | Resolved path | State | Notes |
| --- | --- | --- | --- |
| | | resolved and staged / compatibility alias / unresolved source | |

## Patches and runtime policies

| Component | Change type | Required for | Evidence |
| --- | --- | --- | --- |
| | workflow/runtime policy / ComfyUI patch / custom-node patch / environment fix | | |

## Validation evidence

| Evidence type | Path / link | Scope | Notes |
| --- | --- | --- | --- |
| Prompt validation response | | API prompt / GUI import / both | |
| Branch smoke history | | branch ID and reduced settings | |
| Full-run history | | full workflow / selected branch / highest-fidelity failing path | |
| Runtime logs | | server / client / node-specific | |
| XPU telemetry | | sampling interval, device ID, and tool used | |
| Generated outputs | | smoke / full-size / GUI validation | |
| GUI validation evidence | | manual GUI / API-only / not performed | |

When evidence only covers one validation path, label it explicitly. For example, "API prompt validation only" must not be reported as "GUI import validated".

## Assumptions and boundary cases

| Item | Assumption | Verified? | Evidence or required follow-up |
| --- | --- | --- | --- |
| Hardware label | e.g. B60/B70 maps to measured GPU and usable VRAM | Yes / No | |
| Reduced smoke settings | e.g. frame count, resolution, steps remain faithful enough | Yes / No | |
| Branch variants | single image / double image / triple image / first-last / multi-ref | Yes / No | |
| Dimension or frame-count constraints | e.g. dimensions divisible by model requirements; odd/tail frame counts handled or excluded | Yes / No | |
| Asset provenance | source-identical vs compatibility alias | Yes / No | |
| Runtime path | API-only vs GUI/manual validation | Yes / No | |

## Hard stops

| Type | Blocking point | Runtime evidence | Static reasoning | Recommendation |
| --- | --- | --- | --- | --- |
| Capacity / feature-development / integration / asset | | | | |

For every hard stop, include evidence links:

| Required evidence | Path / link | Present |
| --- | --- | --- |
| Failing prompt or workflow copy | | Yes / No |
| Raw validation response, if relevant | | Yes / No |
| Runtime log or traceback | | Yes / No |
| Memory telemetry or driver/system output | | Yes / No |
| Static estimate or source-audit note | | Yes / No |
| Mitigation attempts or reason not attempted | | Yes / No |
| Human decision needed | | Yes / No |

## Known gaps

| Gap | Class | Critical path | User impact | Next action |
| --- | --- | --- | --- | --- |
| | CPU fallback / environment gap / feature-development gap / capacity hard stop | Yes / No | | |

## Reproduction steps

1. Prepare environment:
2. Stage assets:
3. Apply patches:
4. Launch ComfyUI:
5. Submit validation prompt:
6. Verify outputs:

## Final support statement

State exactly what is supported, at what fidelity, on which hardware, with which known gaps. Do not describe smoke-only aliases as source-identical assets and do not describe branch smoke as full-size success.
