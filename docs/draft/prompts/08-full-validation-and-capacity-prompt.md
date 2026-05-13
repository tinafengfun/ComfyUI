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
5. Do not classify a run as source-identical if it uses a runtime-policy prompt variant. Report it as runtime-policy success or failure and keep the original source workflow boundary explicit.
6. Do not declare a capacity hard stop from summed model file sizes alone. Model file sums are conservative; compare them with actual staged runtime telemetry before deciding.

## Steps

1. Run the full or highest-fidelity prompt.
2. Capture failing node, model path, input shape, free memory, and required memory.
3. Compare runtime evidence to static weight and activation estimates.
4. Use the matching capacity skill's decision matrix to decide whether mitigation is still justified.
5. Classify the result: full-size success, restricted success, CPU fallback, integration gap, feature gap, or capacity hard stop.
6. If the run succeeds near the budget limit, classify it as tight success, record peak/budget ratio, and require telemetry to stay with future GUI or delivery validation.
7. Preserve user-facing outputs under the workflow artifact folder when possible. If a target emits only temporary preview/comparer files, copy them or record their history metadata immediately before temp cleanup can remove them.

## Output

Create a full-validation report with:

- run settings
- success/failure point
- output files or failed output node
- runtime memory evidence
- theoretical capacity reasoning
- budget ratio and mitigation decision
- final result class and escalation path
- source-workflow boundary: source-identical, runtime-policy variant, GUI/manual validation, or customer-facing validation
- retained output evidence, distinguishing durable output files from temporary preview/comparer files

## Hard stops

Stop tuning and escalate if runtime evidence shows required memory exceeds available budget and theoretical active-weight/activation analysis agrees.

## Prior-migration lessons

Dasiwa full-size branch `54` was a structural capacity problem on a 24 GB-class card, not an ordinary tuning miss, after both runtime and memory math aligned.

Zimage Step 8 showed the inverse case: a static model-file sum can exceed physical VRAM, while staged execution, low-VRAM policy, purge/offload behavior, and block swap keep the actual runtime peak inside budget. Treat this as tight success only when the full/high-fidelity run completes and telemetry proves the peak ratio.

## Example output shape

```text
Result class: capacity hard stop
Validation level: branch smoke passed; full-size failed
Runtime evidence: failing denoise node requested more memory than usable device budget
Theory evidence: active Wan model path plus activation estimate exceeds single-card budget
Mitigation decision: stop generic lowvram retries; recommend multi-XPU or reduced-fidelity delivery tier
```

```text
Result class: full/high-fidelity runtime-policy success on current XPU target
Validation level: Step 7 branch smoke passed; Step 8 full/high-fidelity API path passed
Runtime evidence: peak runtime memory was 95.4% of physical budget
Theory evidence: summed model files exceeded device memory, but staged execution/offload kept the live peak under budget
Mitigation decision: no capacity hard stop; continue with telemetry and preserve the same launch/runtime policy for GUI or delivery validation
Boundary: source workflow unchanged; runtime-policy prompt variant used; GUI/customer validation not claimed
```
