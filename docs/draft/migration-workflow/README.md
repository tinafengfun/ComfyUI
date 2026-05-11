# Intel XPU workflow migration README

This README is the execution entrypoint for the draft migration operating system.

For the shortest "start now" guide, read `QUICKSTART.md` first.

Use it to answer four questions before and during a migration:

1. What is the overall workflow?
2. Which prompt and skill document should be used at each step?
3. What artifact must each step produce?
4. Where does a human need to decide, approve, or provide missing information?

## Overall workflow

```text
Receive workflow
  -> feasibility route
  -> graph inventory
  -> asset and custom-node prep
  -> source audit
  -> environment deployment
  -> prompt conversion validation
  -> branch smoke validation
  -> full/high-fidelity validation and capacity triage
  -> performance tuning, only if a valid path exists
  -> coverage review
  -> delivery packaging
```

The flow is evidence-gated. A later step should not claim success if an earlier artifact is missing.

## Step-by-step operating map

| Step | Use these docs | Required output | Human intervention point |
| --- | --- | --- | --- |
| 1. Feasibility analysis | `../prompts/01-feasibility-analysis-prompt.md`, `../skills/01-feasibility-analysis-skill.md`, `../templates/intel-xpu-hardware-reference.md` | `01-feasibility.md` with target, hardware budget, fidelity, result route, and assumptions | Human confirms target fidelity, acceptable reduced-resource tier, CPU offload policy, and whether a capacity-risk workflow should proceed. |
| 2. Workflow inventory | `../prompts/02-workflow-inventory-prompt.md`, `../skills/02-workflow-inventory-skill.md` | `02-inventory.md` with branch map, executable nodes, structural nodes, output nodes, and export risks | Human clarifies ambiguous branches, expected outputs, or whether all branches are in scope. |
| 3. Asset and custom-node prep | `../prompts/03-asset-and-custom-node-prep-prompt.md`, `../skills/03-asset-and-custom-node-prep-skill.md` | `03-assets.csv`, `03-custom-nodes.md` with asset state and custom-node commits | Human provides private/proprietary assets, approves smoke-only aliases, or decides that missing source-identical assets block delivery. |
| 4. Source audit | `../prompts/04-source-audit-prompt.md`, `../skills/04-source-audit-skill.md` | `04-source-audit.md` with CUDA/XPU risks, patch class, route, and validation needed | Human decides whether CUDA-only paths become feature-development work, CPU fallback, or out-of-scope gaps. |
| 5. Environment deployment | `../prompts/05-environment-deployment-prompt.md`, `../skills/05-environment-deployment-skill.md`, `../templates/intel-xpu-hardware-reference.md` | `05-environment.md` with actual software stack, launch command, model paths, and registration evidence | Human provides target machine access, approves fresh deployment assumptions, or resolves blocked package installs. |
| 6. Prompt conversion validation | `../prompts/06-prompt-conversion-validation-prompt.md`, `../skills/06-prompt-conversion-validation-skill.md` | `06-prompt.json`, `06-prompt-validation.json` with `node_errors` and validated outputs | Human decides how to handle unrepresentable GUI-only behavior or prompt-export gaps that would change workflow semantics. |
| 7. Branch smoke validation | `../prompts/07-branch-smoke-validation-prompt.md`, `../skills/07-branch-smoke-validation-skill.md` | `07-{branch_slug}-smoke.md` plus prompt, history, logs, and outputs | Human confirms reduced settings are faithful enough for smoke and accepts or rejects visual/media output quality for smoke tier. |
| 8. Full validation and capacity | `../prompts/08-full-validation-and-capacity-prompt.md`, `../skills/08-full-validation-and-capacity-skill.md`, `../templates/intel-xpu-hardware-reference.md` | `08-full-validation.md` with full-run status, memory evidence, theory, result class, and escalation | Human decides whether to pursue activation-level engineering, multi-XPU, reduced-fidelity delivery, or capacity hard stop. |
| 9. Performance tuning | `../prompts/09-performance-tuning-prompt.md`, `../skills/09-performance-tuning-skill.md` | `09-tuning.md` with baseline, candidate matrix, metrics, winner, and rejected candidates | Human chooses optimization target and decides when tuning is no longer worth the risk or time. |
| 10. Coverage review | `../prompts/10-coverage-review-prompt.md`, `../skills/10-coverage-review-skill.md` | `10-coverage-review.md` with every executable node covered by full run, smoke, or explicit gap | Human approves support statement when coverage includes gaps, CPU fallback, or smoke-only branches. |
| 11. Delivery packaging | `../prompts/11-delivery-packaging-prompt.md`, `../skills/11-delivery-packaging-skill.md`, `../templates/migration-result-report-template.md` | `11-delivery.md` or filled migration result report with patches, deployment, validation, outputs, gaps, and acceptance steps | Human approves customer-facing wording, known limitations, manual GUI validation, and final release readiness. |

If the table is hard to read in a narrow Markdown viewer, use the step cards below. They contain the same operating intent without relying on wide columns.

## Step cards

### Step 1: Feasibility analysis

- **Docs**: `../prompts/01-feasibility-analysis-prompt.md`, `../skills/01-feasibility-analysis-skill.md`, `../templates/intel-xpu-hardware-reference.md`
- **Output**: `01-feasibility.md`
- **Human intervention**: confirm fidelity target, hardware budget, reduced-resource acceptance, CPU offload policy, and whether capacity-risk work should proceed.

### Step 2: Workflow inventory

- **Docs**: `../prompts/02-workflow-inventory-prompt.md`, `../skills/02-workflow-inventory-skill.md`
- **Output**: `02-inventory.md`
- **Human intervention**: clarify ambiguous output branches and decide whether every branch is in scope.

### Step 3: Asset and custom-node prep

- **Docs**: `../prompts/03-asset-and-custom-node-prep-prompt.md`, `../skills/03-asset-and-custom-node-prep-skill.md`
- **Output**: `03-assets.csv`, `03-custom-nodes.md`
- **Human intervention**: provide private assets, approve smoke-only aliases, or decide that source-identical gaps block delivery.

### Step 4: Source audit

- **Docs**: `../prompts/04-source-audit-prompt.md`, `../skills/04-source-audit-skill.md`
- **Output**: `04-source-audit.md`
- **Human intervention**: decide whether CUDA-only paths are normal migration work, CPU fallback, feature development, or out of scope.

### Step 5: Environment deployment

- **Docs**: `../prompts/05-environment-deployment-prompt.md`, `../skills/05-environment-deployment-skill.md`, `../templates/intel-xpu-hardware-reference.md`
- **Output**: `05-environment.md`
- **Human intervention**: provide machine access, approve fresh deployment assumptions, or resolve blocked installs.

### Step 6: Prompt conversion validation

- **Docs**: `../prompts/06-prompt-conversion-validation-prompt.md`, `../skills/06-prompt-conversion-validation-skill.md`
- **Output**: `06-prompt.json`, `06-prompt-validation.json`
- **Human intervention**: decide how to handle GUI-only behavior or prompt-export gaps that would change workflow semantics.

### Step 7: Branch smoke validation

- **Docs**: `../prompts/07-branch-smoke-validation-prompt.md`, `../skills/07-branch-smoke-validation-skill.md`
- **Output**: `07-{branch_slug}-smoke.md` plus prompt/history/log/output artifacts
- **Human intervention**: confirm reduced settings are faithful enough and review smoke-tier output quality.

### Step 8: Full validation and capacity

- **Docs**: `../prompts/08-full-validation-and-capacity-prompt.md`, `../skills/08-full-validation-and-capacity-skill.md`, `../templates/intel-xpu-hardware-reference.md`
- **Output**: `08-full-validation.md`
- **Human intervention**: choose activation-level engineering, multi-XPU, reduced-fidelity delivery, or capacity hard stop.

### Step 9: Performance tuning

- **Docs**: `../prompts/09-performance-tuning-prompt.md`, `../skills/09-performance-tuning-skill.md`
- **Output**: `09-tuning.md`
- **Human intervention**: choose optimization target and stop tuning when evidence says the path is capacity- or feature-blocked.

### Step 10: Coverage review

- **Docs**: `../prompts/10-coverage-review-prompt.md`, `../skills/10-coverage-review-skill.md`
- **Output**: `10-coverage-review.md`
- **Human intervention**: approve the support statement when some nodes are smoke-only, CPU fallback, or explicit gaps.

### Step 11: Delivery packaging

- **Docs**: `../prompts/11-delivery-packaging-prompt.md`, `../skills/11-delivery-packaging-skill.md`, `../templates/migration-result-report-template.md`
- **Output**: `11-delivery.md` or filled migration result report
- **Human intervention**: approve customer wording, known limitations, GUI/manual validation requirements, and final release readiness.

## Result classes

Use the canonical result-class definitions in `../intel-xpu-workflow-migration-flow.md#result-classes`.

Every step report should use exactly one of those classes when it summarizes workflow, branch, or node-family status.

## Human approval gates

Stop and ask for human direction when any of these happen:

1. required source-identical model or input asset is missing
2. smoke-only alias would affect customer-facing fidelity claims
3. critical custom node depends on CUDA-only architecture
4. prompt conversion changes workflow semantics
5. branch smoke fails on a critical output path
6. full-size run exceeds measured capacity after reasonable mitigation
7. customer delivery would need to say "full success" but evidence is only smoke-level
8. migration work turns into feature development, platform selection, or hardware escalation

## Minimum artifact bundle

For a reviewable migration, keep at least:

1. workflow JSON and converted prompt
2. feasibility report
3. inventory and asset ledger
4. source audit
5. environment report
6. prompt validation response
7. branch smoke histories and generated outputs
8. full or highest-fidelity validation report
9. tuning report, if tuning was performed
10. coverage review
11. final migration result report

## Documentation quality gates

Before a migration result is considered reviewable, check these documentation rules:

1. **Validation path is explicit**: distinguish API prompt validation, GUI import, GUI manual validation, and customer-facing validation.
2. **Assumptions are scoped**: hardware labels, allocator behavior, model dtype, and reduced settings must be written as measured facts only when evidence exists.
3. **Boundary cases are visible**: if only one branch variant, frame count, or resolution was tested, say that; do not silently generalize to all variants.
4. **Data scope is labeled**: timing, memory, and output-quality numbers must identify the run, branch, hardware, and telemetry source.
5. **Untested cases stay untested**: do not convert missing evidence into a success claim. Mark it as `untested`, `blocked`, or `out of scope`.

## Quick start example

1. Use `../templates/intel-xpu-hardware-reference.md` to map the requested machine label, such as `B60` or `B70`, to measured GPU facts.
2. Run the Step 1 prompt on the workflow JSON and produce `01-feasibility.md`.
3. If `initial_class` is `capacity risk`, pause for a human fidelity/hardware decision before spending time on deployment.
4. If feasible, run Steps 2-7 sequentially and keep each required artifact.
5. At Step 8, classify full/high-fidelity status using measured usable VRAM and the capacity matrix.
6. Fill `../templates/migration-result-report-template.md` before customer or management review.

Minimal command-oriented checklist:

```text
measure hardware -> 01-feasibility.md -> 02-inventory.md -> 03-assets.csv
-> 04-source-audit.md -> 05-environment.md -> 06-prompt-validation.json
-> 07-branch-smoke.md -> 08-full-validation.md -> 10-coverage-review.md
-> 11-delivery.md
```

Skip `09-tuning.md` only when no validated path exists to tune or when the case is already classified as capacity/feature-development hard stop.

## Dasiwa-derived caution

The Dasiwa migration showed why this workflow is strict:

1. reduced-resource branch smoke can be valid migration evidence, but it is not full-size success
2. `execution_success` is not enough if the intended output node was pruned or never emitted output
3. compatibility aliases can validate graph reachability, but not source-identical fidelity
4. full-size Wan video geometry on a 24 GB-class single XPU can be a structural capacity limit
5. GUI/customer validation requires a separate delivery layer, not only engineering logs

Use these as reusable lessons, not as assumptions that every new workflow behaves like Dasiwa.

## Known workflow evidence index

| Case | Evidence level | What it proves | What it does not prove |
| --- | --- | --- | --- |
| Dasiwa WAN2.2 B60 reduced-resource branches | Branch smoke | Preserved graph branches can execute on Intel XPU at reduced geometry. | Full-size production geometry on a 24 GB-class single XPU. |
| Dasiwa WAN2.2 B60 full-size branch `54` | Capacity hard-stop evidence | Full-size `1024 / 81-frame` Wan denoise can exceed 24 GB-class single-XPU budget. | That every Wan workflow or every larger hardware target must fail. |
| Original remote 32 GB XPU tuning annex | Full baseline benchmark for that remote host | Conservative CPU-biased policy completed the earlier full workflow and beat tested tuning variants. | That "B70" is an official 32 GB hardware product or that all 32 GB hosts share the same usable VRAM. |
| WanVideoWrapper retained B70 smoke evidence | Package-family smoke through workflow case | Representative Wan/Qwen node families can be exercised by the retained smoke workflow. | Repo-wide WanVideoWrapper support across every node family. |
