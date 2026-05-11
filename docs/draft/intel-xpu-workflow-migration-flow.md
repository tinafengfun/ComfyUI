# Draft Intel XPU workflow migration flow

This draft turns the previous migration work and existing docs into a reusable operating flow for ComfyUI workflow migration to Intel XPU.

## Evidence sources

This flow merges:

1. **Process reflection**: Dasiwa workflow migration, B60/B70 validation, Mixlab package migration, Wan package bootstrap, GUI delivery, OOM diagnosis, and artifact cleanup.
2. **Existing docs**: workflow migration prompt/skill, asset prep, deployment, tuning, review prompt, release standard, migration checklist, node-package standards, support matrices, gap reports, and delivery artifacts.

## Result classes

Every workflow, branch, or node family must end in one of these classes:

| Class | Meaning |
| --- | --- |
| Intel-XPU migrated | Native XPU execution is retained with evidence. |
| CPU fallback | Usable path exists, but meaningful compute remains on CPU. |
| Environment / integration gap | Packaging, provider, codec, service, asset, or deployment wiring blocks validation. |
| Feature-development gap | CUDA-shaped architecture or unsupported backend requires real feature work. |
| Capacity hard stop | Target fidelity exceeds the intended hardware budget after reasonable mitigation. |

## Decision gates

These gates keep the flow executable without pretending that a single number can decide every migration.

### Capacity gate

Use both runtime evidence and a static estimate. Do not declare capacity hard stop from only one of them.

Static estimate:

```text
estimated_peak_vram =
  active_model_weights
  + active_lora_or_adapter_weights
  + activation_peak
  + runtime_workspace
  + safety_margin
```

Minimum safety margin:

| Hardware pressure | Margin to reserve |
| --- | --- |
| Small smoke run | 10% of device VRAM |
| Near-production run | 15% of device VRAM |
| Unknown custom-node memory behavior | 20% of device VRAM |

Runtime decision matrix:

| Runtime required memory vs usable budget | Meaning | Action |
| --- | --- | --- |
| `< 80%` | Comfortable | Continue normal validation. |
| `80-100%` | Tight but plausible | Continue with telemetry; test only targeted offload/placement knobs. |
| `100-120%` | Over budget but close | Allow one bounded mitigation pass if the failing node and theory suggest a plausible fix; prepare hard-stop report. |
| `> 120%` | Structurally over budget | Stop normal tuning and classify as capacity hard stop if theory also agrees. |

Evidence required for capacity hard stop:

1. failing node and model path
2. runtime log or telemetry showing free/required memory
3. target hardware usable VRAM
4. static estimate with assumptions
5. mitigation attempts already tried or explicitly ruled out
6. recommended escalation: multi-XPU, lower fidelity, activation-level runtime work, or different serving architecture

This gate comes from the Dasiwa full-size branch `54` work: repeated generic low-vram attempts did not change the root cause once runtime evidence and memory math both showed the active Wan denoise path exceeded the single-card budget.

## Operating flow

| Step | Goal | Outputs | Hard stop |
| --- | --- | --- | --- |
| 1. Feasibility analysis | Route the task before code changes. | Feasibility report, target budget, initial risk class. | Target requirement is not a ComfyUI workflow migration, or required fidelity already exceeds available hardware. |
| 2. Workflow inventory | Understand graph shape, branches, outputs, and critical paths. | Topology inventory, branch map, executable-node list. | Graph cannot be represented or output branches are unclear. |
| 3. Asset and custom-node prep | Resolve models, LoRAs, input media, custom nodes, nested repos. | Asset ledger, custom-node ledger, missing/proprietary list. | Required source-identical asset is unavailable and no approved smoke-only alias is acceptable. |
| 4. Source audit | Verify XPU risk from source. | Risk matrix, patch class, fallback/blocker classification. | Critical path depends on CUDA-only kernels or `.cuda()` architecture with no safe fallback. |
| 5. Environment deployment | Build reproducible Intel XPU baseline. | Launch command, environment baseline, startup/registration evidence. | Environment cannot install, import, or register required nodes. |
| 6. Prompt conversion validation | Prove the API prompt is complete before runtime claims. | Converted prompt, raw `/prompt` response, `node_errors` review. | Intended output node is missing, pruned, or blocked by validation errors. |
| 7. Branch smoke validation | Prove branch reachability cheaply. | Branch prompt, history, logs, generated media, node evidence. | Critical branch cannot produce a faithful smoke output. |
| 8. Full validation and capacity | Test full or highest-fidelity path and classify failures. | Full-run evidence, failure point, memory math, result class. | Runtime and theoretical memory both exceed target budget. |
| 9. Performance tuning | Improve a proven path with controlled measurement. | Baseline, candidate matrix, winner, regressions, telemetry. | Candidate tuning cannot beat baseline or root cause is capacity. |
| 10. Coverage review | Audit whether every executable node is covered by evidence. | Coverage table, uncovered nodes, final support statement. | Any executable node lacks full-run, branch-smoke, or explicit gap evidence. |
| 11. Delivery packaging | Produce customer/engineering handoff. | Patches, deployment guide, evidence bundle, acceptance steps. | Package cannot reproduce the claimed result. |

## Artifact contract

Each step should pass explicit artifacts to the next step. File names may be adjusted by project, but the fields are mandatory.

Default naming rule:

```text
{workflow_slug}/{step_number}-{artifact_name}.{json|md|csv}
```

Use a stable `workflow_slug` derived from the workflow name, not from a temporary run ID. If a project already has an artifact convention, it may use that convention only if the required fields below are still present and the draft/release docs link to the actual path.

| Step | Artifact | Suggested file name | Required fields |
| --- | --- | --- | --- |
| 1 | Feasibility report | `{workflow_slug}/01-feasibility.md` | `target`, `hardware_budget`, `fidelity`, `initial_class`, `risks`, `next_step` |
| 2 | Workflow inventory | `{workflow_slug}/02-inventory.md` | `node_count`, `link_count`, `outputs`, `branches`, `critical_path`, `custom_node_packages`, `export_risks` |
| 3 | Asset/custom-node ledger | `{workflow_slug}/03-assets.csv` and `{workflow_slug}/03-custom-nodes.md` | `requested_name`, `resolved_path`, `source`, `state`, `staged_path`, `repo`, `commit`, `install_status` |
| 4 | Source audit report | `{workflow_slug}/04-source-audit.md` | `node_family`, `risk`, `source_path`, `critical_path`, `patch_class`, `recommended_route`, `evidence` |
| 5 | Environment report | `{workflow_slug}/05-environment.md` | `repo_commit`, `venv`, `python`, `torch`, `ipex`, `driver`, `launch_command`, `model_paths`, `registration_status` |
| 6 | Prompt validation package | `{workflow_slug}/06-prompt.json` and `{workflow_slug}/06-prompt-validation.json` | `prompt_path`, `node_errors`, `validated_outputs`, `missing_inputs`, `pruned_outputs` |
| 7 | Branch smoke report | `{workflow_slug}/07-{branch_slug}-smoke.md` | `branch`, `output_node`, `settings`, `history`, `outputs`, `placement`, `status`, `gap` |
| 8 | Full validation report | `{workflow_slug}/08-full-validation.md` | `run_target`, `status`, `failing_node`, `memory_runtime`, `memory_theory`, `mitigations`, `result_class` |
| 9 | Tuning report | `{workflow_slug}/09-tuning.md` | `baseline`, `candidates`, `metrics`, `winner`, `rejected`, `remaining_bottleneck` |
| 10 | Coverage review | `{workflow_slug}/10-coverage-review.md` | `node_id`, `node_type`, `prompt_present`, `full_run`, `smoke_run`, `status`, `evidence` |
| 11 | Delivery package | `{workflow_slug}/11-delivery.md` | `support_statement`, `patches`, `deployment`, `validation`, `outputs`, `known_gaps`, `acceptance_steps` |

If a required artifact is missing, the next step must either stop or explicitly state why the missing artifact is not applicable.

## Cross-step constraints

1. Do not remove, bypass, collapse, or replace workflow nodes to create a fake success.
2. Do not trust `execution_success` without reviewing `node_errors`, intended output nodes, and actual output files.
3. Do not claim source fidelity from a compatibility alias.
4. Do not generalize one branch success to the whole workflow.
5. Do not keep tuning after runtime and theoretical evidence prove a capacity hard stop.
6. Do not call engineering smoke customer-ready without GUI or end-user validation evidence.

## Post-delivery regression rule

For long-lived migrations, add a lightweight regression check after delivery rather than treating the handoff as permanent. At minimum, retain one prompt-validation check and one smallest faithful smoke case per delivered branch. Do not claim CI coverage unless an actual CI job exists.

## Lessons embedded from prior migrations

1. Dasiwa showed that workflow topology and branch isolation must come before full-run claims.
2. Dasiwa prompt export failures showed that widget-only inputs and selector-backed names must be audited explicitly.
3. Dasiwa full-size branch `54` showed that repeated low-vram experiments are not useful after capacity is proven structurally.
4. Dasiwa delivery showed that customer validation needs preserved workflow copies, GUI steps, generated outputs, and acceptance wording.
5. Mixlab showed that package import success is not repo-wide support; support must be per family.
6. Wan showed that bootstrap/registration evidence is its own milestone before runtime smoke.
7. Artifact cleanup showed that delivery docs must avoid duplicate competing entrypoints for the same workflow.

## Prompt and skill mapping

Use the matching prompt to ask an AI agent to perform a step. Use the matching skill as the reusable method reference while executing that step.
