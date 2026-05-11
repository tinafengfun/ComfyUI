# Draft Intel XPU migration operating system

This folder is for human review before any content is promoted into canonical `docs/`.

The drafts combine two sources:

1. **Process reflection** from the Dasiwa, Mixlab, Wan, and delivery work: what failed, what was disproven, which evidence gates mattered, and where humans must decide.
2. **Existing-doc extraction** from `docs/**/*.md`: reusable rules, checklists, prompt language, release standards, support-matrix vocabulary, and artifact requirements.

## Review order

1. `migration-workflow/README.md`
2. `intel-xpu-workflow-migration-flow.md`
3. `templates/intel-xpu-hardware-reference.md`
4. `templates/migration-result-report-template.md`
5. `prompts/`
6. `skills/`
7. existing retrospective drafts, if you want the background narrative:
   - `migration-retrospective.md`
   - `request-closure-review.md`
   - `documentation-consolidation-plan.md`

## Main operating README

Use `migration-workflow/README.md` as the entrypoint for execution. It describes the overall migration workflow, which prompt/skill to use at each step, the expected artifact, and where human intervention is required.

If you already have a workflow JSON and want to start immediately, use `migration-workflow/QUICKSTART.md`.

The lower-level files remain references:

1. `intel-xpu-workflow-migration-flow.md`
2. `prompts/`
3. `skills/`
4. `templates/`

## Legacy review order

If you want to review the original draft layering directly:

1. `intel-xpu-workflow-migration-flow.md`
2. `prompts/`
3. `skills/`
4. existing retrospective drafts, if you want the background narrative:
   - `migration-retrospective.md`
   - `request-closure-review.md`
   - `documentation-consolidation-plan.md`

## Prompt / skill contract

The draft keeps prompts and skills as separate files on purpose:

| Type | Audience | Role |
| --- | --- | --- |
| Prompt | User or task dispatcher | Defines **what to ask an AI agent to do**, the required context, required outputs, and stop conditions. |
| Skill | Implementing engineer or AI agent | Defines **how to execute the step**, including algorithms, known failure signatures, evidence standards, and output schema. |

Each prompt should be used together with the skill of the same step number. The prompt is the task instruction; the skill is the execution reference. If a rule is updated, update both only when the user-facing instruction and the execution method both change.

## Generated draft set

| Step | Prompt | Skill |
| --- | --- | --- |
| 1. Feasibility analysis | `prompts/01-feasibility-analysis-prompt.md` | `skills/01-feasibility-analysis-skill.md` |
| 2. Workflow inventory | `prompts/02-workflow-inventory-prompt.md` | `skills/02-workflow-inventory-skill.md` |
| 3. Asset and custom-node prep | `prompts/03-asset-and-custom-node-prep-prompt.md` | `skills/03-asset-and-custom-node-prep-skill.md` |
| 4. Source audit | `prompts/04-source-audit-prompt.md` | `skills/04-source-audit-skill.md` |
| 5. Environment deployment | `prompts/05-environment-deployment-prompt.md` | `skills/05-environment-deployment-skill.md` |
| 6. Prompt conversion validation | `prompts/06-prompt-conversion-validation-prompt.md` | `skills/06-prompt-conversion-validation-skill.md` |
| 7. Branch smoke validation | `prompts/07-branch-smoke-validation-prompt.md` | `skills/07-branch-smoke-validation-skill.md` |
| 8. Full validation and capacity | `prompts/08-full-validation-and-capacity-prompt.md` | `skills/08-full-validation-and-capacity-skill.md` |
| 9. Performance tuning | `prompts/09-performance-tuning-prompt.md` | `skills/09-performance-tuning-skill.md` |
| 10. Coverage review | `prompts/10-coverage-review-prompt.md` | `skills/10-coverage-review-skill.md` |
| 11. Delivery packaging | `prompts/11-delivery-packaging-prompt.md` | `skills/11-delivery-packaging-skill.md` |

## Templates

| File | Purpose |
| --- | --- |
| `templates/migration-result-report-template.md` | Standard final report shape for a workflow migration result, including branch coverage, hard stops, gaps, patches, and reproduction steps. |
| `templates/intel-xpu-hardware-reference.md` | Hardware-side worksheet for target VRAM, telemetry commands, and evidence-backed B60/B70 notes. Unknown hardware values must be measured, not guessed. |

## Core rules reviewers should check

1. The flow never allows node deletion, bypass, or graph collapse as a migration success shortcut.
2. Prompt validation, branch smoke, full-size validation, and customer GUI validation are separate evidence levels.
3. Compatibility aliases are explicitly smoke-only unless source-identical provenance is proven.
4. CPU fallback, environment gaps, feature-development gaps, and capacity hard stops remain visible.
5. Capacity hard stop is triggered only when runtime memory evidence and theoretical memory reasoning agree.
6. Delivery claims must match retained evidence: prompts, histories, logs, generated outputs, patches, and deployment steps.

## Promotion suggestion after review

If approved, promote the flow into the canonical migration docs and move the prompt/skill drafts either into top-level reusable docs or into a dedicated prompt/skill directory. Keep case-specific evidence in artifact bundles.

The current draft intentionally does not merge the retrospective and closure-review files yet. They are background review material; the operational handoff should use the flow, prompt, skill, and template files above.
