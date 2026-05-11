# Full validation and capacity prompt

## Task

Run the full workflow or highest-fidelity reproducible path and decide whether remaining failures are migration bugs, tuning opportunities, or capacity hard stops.

## Required context

- branch-smoke evidence
- full or high-fidelity prompt
- model memory estimates
- runtime memory instrumentation
- target hardware budget

## Constraints

1. Do not call branch smoke a full-size success.
2. Compare runtime memory evidence with theoretical memory reasoning.
3. Do not retry generic low-vram knobs indefinitely.
4. Preserve the highest-fidelity failure case if full success is impossible.

## Steps

1. Run the full or highest-fidelity prompt.
2. Capture failing node, model path, input shape, free memory, and required memory.
3. Compare runtime evidence to static weight and activation estimates.
4. Use the matching capacity skill's decision matrix to decide whether mitigation is still justified.
5. Classify the result: full-size success, restricted success, CPU fallback, integration gap, feature gap, or capacity hard stop.

## Output

Create a full-validation report with:

- run settings
- success/failure point
- output files or failed output node
- runtime memory evidence
- theoretical capacity reasoning
- budget ratio and mitigation decision
- final result class and escalation path

## Hard stops

Stop tuning and escalate if runtime evidence shows required memory exceeds available budget and theoretical active-weight/activation analysis agrees.

## Prior-migration lessons

Dasiwa full-size branch `54` was a structural capacity problem on a 24 GB-class card, not an ordinary tuning miss, after both runtime and memory math aligned.

## Example output shape

```text
Result class: capacity hard stop
Validation level: branch smoke passed; full-size failed
Runtime evidence: failing denoise node requested more memory than usable device budget
Theory evidence: active Wan model path plus activation estimate exceeds single-card budget
Mitigation decision: stop generic lowvram retries; recommend multi-XPU or reduced-fidelity delivery tier
```
