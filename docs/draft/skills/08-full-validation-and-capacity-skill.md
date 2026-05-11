# Full validation and capacity skill

## Use when

Use after branch smoke to test target fidelity or highest-fidelity reproducible path.

## Inputs

- validated full prompt
- smoke evidence
- memory estimates
- runtime instrumentation
- target budget

## Algorithm

1. Run the full or highest-fidelity prompt.
2. Capture exact failing node and model path if it fails.
3. Compare runtime free/required memory with hardware budget.
4. Compare active weights and activation estimate with runtime evidence.
5. Try only reasonable mitigations.
6. Classify result honestly.

## Capacity decision matrix

Use usable VRAM after reserves, not the marketing memory size.

| Runtime required memory vs usable budget | Decision |
| --- | --- |
| `< 80%` | Continue normal validation; capacity is not the first suspect. |
| `80-100%` | Continue with telemetry; try targeted reserve/offload/placement changes only if needed. |
| `100-120%` | Allow one bounded mitigation pass if source and graph evidence show a plausible fix; prepare hard-stop evidence in parallel. |
| `> 120%` | Stop generic tuning once static reasoning agrees; classify as capacity hard stop. |

Reasonable mitigations include targeted CPU placement for VAE/text/image preprocess stages, reserve adjustment, validated attention mode changes, reduced frame count/resolution for a restricted tier, or multi-XPU escalation. Repeating generic `lowvram` settings without a new hypothesis is not a mitigation.

## Common failure signatures

- generic lowvram retries after capacity is proven
- CPU VAE expected to fix sampler activation peak
- wrong branch blamed before instrumentation
- full-size failure reported as unresolved generic issue

## Evidence standard

Retain full prompt, history, logs, memory telemetry, failure traceback, output files, and theoretical memory notes.

Capacity hard-stop evidence must include:

- full or highest-fidelity prompt used
- failing node and output branch
- runtime free/required memory or OOM traceback
- target usable VRAM
- static memory estimate and assumptions
- mitigations tried or ruled out
- recommended next route

## Hard stops

Stop and classify as capacity hard stop when runtime and theory both exceed budget.

## Output schema

`run_target`, `status`, `failing_node`, `memory_runtime`, `memory_theory`, `budget_ratio`, `mitigations`, `result_class`, `escalation`.
