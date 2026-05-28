# Feasibility analysis prompt

Use this prompt before changing code or running expensive jobs.

The backend may create a deterministic `02-feasibility.md` precheck before invoking this prompt. Treat that file as input evidence, not as proof that Step 02 is complete. Step 02 is complete only after the feasibility agent has reviewed Step 00 and Step 01 artifacts and returned a routing decision or human gate.

## Task

Analyze whether the target ComfyUI workflow should proceed as a normal Intel XPU migration, CPU fallback, environment/integration task, feature-development task, or capacity escalation.

This is logical Step 02 in the current backend flow.

Numbering note: this file keeps the legacy `01-feasibility...` filename, but it is not the Step 01 asset-preparation prompt. Logical Step 01 uses `03-asset-and-custom-node-prep-prompt.md`.

## Required context

- workflow JSON path
- target Intel XPU hardware and VRAM budget
- expected fidelity: smoke, reduced-resource, production, or source-identical
- allowed CPU offload and multi-XPU availability
- known model roots, custom-node roots, and prior notes
- `00-intake-preflight.md`
- `01-assets.csv`
- `01-custom-nodes.md`
- any Step 01 acquisition/cache evidence, including staged custom-node commits and hidden runtime assets

## Constraints

1. Do not modify the workflow.
2. Do not assume native XPU success.
3. Treat prior notes as hypotheses until verified.
4. Keep smoke, full-size, and customer validation as separate goals.
5. Do not rely on Step 00 alone after Step 01 has produced asset/custom-node evidence.

## Steps

1. Identify user goal, target hardware, fidelity target, and delivery expectation.
2. Read Step 00 and Step 01 artifacts. Confirm whether visible assets, hidden runtime assets, and custom-node source commits are resolved, staged, unresolved, or smoke-only.
3. Identify obvious non-migration cases: API serving requirement, high concurrency, unsupported runtime, or non-ComfyUI target.
4. Estimate whether the largest active path may exceed target VRAM using the matching feasibility skill's estimate template.
5. Identify critical custom nodes that may be CUDA-only, unregistered, version-mismatched, or only staged in an artifact cache.
6. Classify the initial route.

## Output

Create a feasibility report with:

- target and budget
- expected branches and outputs
- estimated peak memory and assumptions
- initial route: XPU migration, CPU fallback, integration gap, feature-development gap, capacity risk, or non-ComfyUI route
- assumptions needing verification
- source/acquisition readiness from Step 01
- next recommended step

Write the final report as `02-feasibility.md`.

## Hard stops

Stop and ask a human if the target fidelity appears larger than hardware budget, the required runtime is not ComfyUI, or the user requires source-identical assets that are not available.

Do not mark Step 02 complete only because a deterministic precheck has no source-identical asset blockers. The agent must produce the final feasibility route or a human gate.

## Prior-migration lessons

Dasiwa showed that capacity and branch structure must be considered before full-run attempts. Mixlab showed that package-level scope can hide many unsupported families behind one successful import.

## Example output shape

```text
Initial class: capacity risk, branch-smoke first
Reason: full-fidelity video branch may exceed single-card VRAM, but reduced-resource branch can still validate graph reachability.
Next step: workflow inventory and branch map before source audit or runtime changes.
Human decision: confirm whether reduced-fidelity smoke is acceptable when full-size single-card execution is not.
```
