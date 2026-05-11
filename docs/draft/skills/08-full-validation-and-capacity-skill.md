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

## Common failure signatures

- generic lowvram retries after capacity is proven
- CPU VAE expected to fix sampler activation peak
- wrong branch blamed before instrumentation
- full-size failure reported as unresolved generic issue

## Evidence standard

Retain full prompt, history, logs, memory telemetry, failure traceback, output files, and theoretical memory notes.

## Hard stops

Stop and classify as capacity hard stop when runtime and theory both exceed budget.

## Output schema

`run_target`, `status`, `failing_node`, `memory_runtime`, `memory_theory`, `mitigations`, `result_class`, `escalation`.
