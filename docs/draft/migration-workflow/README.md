# Intel XPU workflow migration README

This README is the execution entrypoint for the draft migration operating system.

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

## Result classes

Use one of these result classes in every report:

| Result class | When to use |
| --- | --- |
| Intel-XPU migrated | Native XPU execution is proven with retained evidence. |
| CPU fallback | The workflow or node family is useful, but meaningful compute remains on CPU. |
| Environment / integration gap | Packaging, provider, codec, service, asset, or deployment wiring blocks validation. |
| Feature-development gap | The remaining work requires architecture or backend development, not normal migration. |
| Capacity hard stop | Runtime evidence and static reasoning both show target fidelity exceeds measured hardware budget. |

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

## Dasiwa-derived caution

The Dasiwa migration showed why this workflow is strict:

1. reduced-resource branch smoke can be valid migration evidence, but it is not full-size success
2. `execution_success` is not enough if the intended output node was pruned or never emitted output
3. compatibility aliases can validate graph reachability, but not source-identical fidelity
4. full-size Wan video geometry on a 24 GB-class single XPU can be a structural capacity limit
5. GUI/customer validation requires a separate delivery layer, not only engineering logs

Use these as reusable lessons, not as assumptions that every new workflow behaves like Dasiwa.
