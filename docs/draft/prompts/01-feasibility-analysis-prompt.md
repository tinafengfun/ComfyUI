# Feasibility analysis prompt

Use this prompt before changing code or running expensive jobs.

## Task

Analyze whether the target ComfyUI workflow should proceed as a normal Intel XPU migration, CPU fallback, environment/integration task, feature-development task, or capacity escalation.

## Required context

- workflow JSON path
- target Intel XPU hardware and VRAM budget
- expected fidelity: smoke, reduced-resource, production, or source-identical
- allowed CPU offload and multi-XPU availability
- known model roots, custom-node roots, and prior notes

## Constraints

1. Do not modify the workflow.
2. Do not assume native XPU success.
3. Treat prior notes as hypotheses until verified.
4. Keep smoke, full-size, and customer validation as separate goals.

## Steps

1. Identify user goal, target hardware, fidelity target, and delivery expectation.
2. Identify obvious non-migration cases: API serving requirement, high concurrency, unsupported runtime, or non-ComfyUI target.
3. Estimate whether the largest active path may exceed target VRAM using the matching feasibility skill's estimate template.
4. Identify critical custom nodes that may be CUDA-only.
5. Classify the initial route.

## Output

Create a feasibility report with:

- target and budget
- expected branches and outputs
- estimated peak memory and assumptions
- initial route: XPU migration, CPU fallback, integration gap, feature-development gap, capacity risk, or non-ComfyUI route
- assumptions needing verification
- next recommended step

## Hard stops

Stop and ask a human if the target fidelity appears larger than hardware budget, the required runtime is not ComfyUI, or the user requires source-identical assets that are not available.

## Prior-migration lessons

Dasiwa showed that capacity and branch structure must be considered before full-run attempts. Mixlab showed that package-level scope can hide many unsupported families behind one successful import.

## Example output shape

```text
Initial class: capacity risk, branch-smoke first
Reason: full-fidelity video branch may exceed single-card VRAM, but reduced-resource branch can still validate graph reachability.
Next step: workflow inventory and branch map before source audit or runtime changes.
Human decision: confirm whether reduced-fidelity smoke is acceptable when full-size single-card execution is not.
```
