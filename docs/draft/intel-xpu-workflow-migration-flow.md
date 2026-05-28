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

Use `templates/intel-xpu-hardware-reference.md` to record the target hardware and usable VRAM. The capacity matrix depends on measured usable budget, not on a marketing label or an environment nickname.

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

Do not treat static model file-size sums as resident runtime memory. File sums are a conservative warning and can exceed physical VRAM even when staged execution, offload, purge nodes, or block swap keep the live peak under budget. Conversely, a successful run in the `80-100%` band is tight success, not comfortable headroom; preserve the launch flags and telemetry for any later GUI or delivery validation.

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
| 0. Intake and dependency-source preflight | Parse every source workflow node and local/source notes without doing acquisition. Route exact gaps to Step 01. | `00-intake-preflight.md` with node/link/output counts, all-node scan coverage, dependency states, source hints, human inputs, `can_start_step01`, and `can_skip_step01_and_continue_to_feasibility`. | The workflow cannot be read, not every node can be scanned/accounted for, source context is unsafe to record, or continuing would require guessing identity, bypassing nodes, or changing workflow semantics. |
| 1. Asset and custom-node resolution | Resolve models, LoRAs, input media, custom nodes, nested repos, and hidden runtime assets for every Step 00 node, then acquire source-known dependencies into an isolated workflow cache when approved. | Asset ledger, custom-node ledger, per-node dependency scan coverage, acquisition/cache evidence, missing/proprietary list. | Any Step 00 node lacks a dependency scan row, or a required source-identical asset/critical custom-node source is unavailable and no approved smoke-only alias is acceptable. |
| 2. Feasibility analysis | Route the task after dependency/source evidence is known. | Feasibility report, target budget, initial risk class, Step 01 readiness summary. | Target requirement is not a ComfyUI workflow migration, required fidelity already exceeds available hardware, or source-identical dependency gaps block the requested route. |
| 3. Workflow inventory | Understand graph shape, branches, outputs, and critical paths. | Topology inventory, branch map, executable-node list, node inventory table. | Graph cannot be represented or output branches are unclear. |
| 4. Source audit | Verify XPU risk from source and workflow-side runtime choices. | Risk matrix, workflow widget evidence, patch class, fallback/blocker classification. | Critical path depends on CUDA-only kernels, `.cuda()` architecture, or CUDA-hard-coded widget/device policy with no safe approved fallback. |
| 5. Environment deployment | Build reproducible Intel XPU baseline. | Launch command, environment baseline, model-path wiring, startup/API registration evidence, patch artifacts, runtime dependency decisions. | Environment cannot install/import, uses the wrong PyTorch accelerator build, starts on the wrong device, cannot register required nodes, or omits known portable runtime dependencies for selected target nodes. |
| 6. Prompt conversion validation | Prove the API prompt is complete before runtime claims; when needed, create an explicit runtime-policy validation variant as a Step 6 sub-pass. | Converted prompt, validation response, validation method, `node_errors` review, output-node comparison, optional policy-variant prompt and change notes. | Intended output node is missing, pruned, blocked by validation errors, or requires silent workflow-semantic rewrites to pass. |
| 7. Branch smoke validation | Prove branch reachability cheaply. | Branch prompt, history, logs, generated media, executed/cached-node evidence, dependency-gap evidence. | Critical branch cannot produce a faithful smoke output. |
| 8. Full validation and capacity | Test full or highest-fidelity path and classify failures. | Full-run evidence, failure point, memory math, result class. | Runtime and theoretical memory both exceed target budget. |
| 9. Performance tuning | Improve a proven path with controlled measurement. | Baseline, candidate matrix, winner, regressions, telemetry. | Candidate tuning cannot beat baseline or root cause is capacity. |
| 10. Coverage review | Audit whether every executable node is covered by evidence. | Coverage table, uncovered nodes, final support statement. | Any executable node lacks full-run, branch-smoke, or explicit gap evidence. |
| 11. Delivery packaging | Produce customer/engineering handoff. | Patches, deployment guide, evidence bundle, acceptance steps. | Package cannot reproduce the claimed result. |
| 12. GUI acceptance and demo | Prepare and run a clean GUI/manual final acceptance path. | Patched GUI environment recipe, model-path config, runtime-policy GUI workflow JSON, manual run record, demo outputs. | Clean GUI environment cannot resolve nodes/models/patches, or acceptance would require bypassing nodes. |

## Artifact contract

Each step should pass explicit artifacts to the next step. File names may be adjusted by project, but the fields are mandatory.

Default naming rule:

```text
{workflow_slug}/{step_number}-{artifact_name}.{json|md|csv}
```

Use a stable `workflow_slug` derived from the workflow name, not from a temporary run ID. If a project already has an artifact convention, it may use that convention only if the required fields below are still present and the draft/release docs link to the actual path.

| Step | Artifact | Suggested file name | Required fields |
| --- | --- | --- | --- |
| 0 | Intake/dependency-source preflight | `{workflow_slug}/00-intake-preflight.md`, optionally `{workflow_slug}/00-node-scan.csv` for large workflows | `workflow`, `artifact_folder`, `node_count`, `link_count`, `output_nodes`, `source_node_count`, `scanned_node_count`, `missing_node_ids`, `node_scan_coverage`, `required_models`, `required_input_media`, `required_custom_nodes`, `dependency_states`, `source_hints`, `hard_stops`, `human_inputs_needed`, `can_start_step01`, `can_skip_step01_and_continue_to_feasibility`, `next_step` |
| 1 | Asset/custom-node ledger and acquisition/cache evidence | `{workflow_slug}/01-assets.csv`, `{workflow_slug}/01-custom-nodes.md`, optionally `{workflow_slug}/01-node-dependency-scan.csv` for large workflows, and when downloads/clones occur additional Step 01 acquisition/cache evidence | `requested_name`, `resolved_path`, `source`, `state`, `staged_path`, `repo`, `commit`, `custom_node_cache_path`, `wrapper_source_evidence`, `install_status`, `acquisition_status`, `source_node_count`, `dependency_scanned_node_count`, `missing_dependency_scan_node_ids`, `node_dependency_scan`, `mirror_used`, `credential_recorded`, `remaining_hard_stops` |
| 2 | Feasibility report | `{workflow_slug}/02-feasibility.md` | `target`, `hardware_budget`, `fidelity`, `asset_custom_node_readiness`, `initial_class`, `risks`, `next_step` |
| 3 | Workflow inventory | `{workflow_slug}/03-inventory.md`, or split as `{workflow_slug}/03-workflow-topology.md` plus `{workflow_slug}/03-node-inventory.csv` | `node_count`, `link_count`, `outputs`, `branches`, `critical_path`, `custom_node_packages`, `export_risks`, `disconnected_nodes`, `node_inventory` |
| 4 | Source audit report | `{workflow_slug}/04-source-audit.md` | `node_family`, `risk`, `source_path`, `workflow_node_ids`, `widget_evidence`, `critical_path`, `patch_class`, `recommended_route`, `evidence`, `validation_needed` |
| 5 | Environment report | `{workflow_slug}/05-environment.md` | `repo_commit`, `venv`, `python`, `torch`, `torchvision`, `torchaudio`, `xpu_available`, `ipex`, `driver`, `level_zero`, `launch_command`, `model_paths`, `custom_nodes`, `registration_status`, `api_evidence`, `patches`, `installed_runtime_dependencies`, `skipped_dependencies`, `deferred_dependencies`, `gaps` |
| 6 | Prompt validation package | `{workflow_slug}/06-prompt.json`, `{workflow_slug}/06-prompt-validation.json`, and optionally `{workflow_slug}/06-prompt-validation.md`, `{workflow_slug}/06-conversion-notes.json`, `{workflow_slug}/06b-runtime-policy-prompt.json`, `{workflow_slug}/06b-runtime-policy-notes.json` | `prompt_path`, `validation_method`, `queued_execution`, `node_errors`, `validated_outputs`, `missing_inputs`, `pruned_outputs`, `conversion_fixes`, `semantic_change_required`, `variant_changes`, `source_workflow_modified`, `nodes_bypassed` |
| 7 | Branch smoke report | `{workflow_slug}/07-{branch_slug}-smoke.md` | `branch`, `output_node`, `settings`, `history`, `outputs`, `executed_nodes`, `cached_nodes`, `placement`, `dependency_fixes`, `cache_bust_verification`, `status`, `gap` |
| 8 | Full validation report | `{workflow_slug}/08-full-validation.md` | `run_target`, `status`, `source_boundary`, `partial_execution_targets`, `executed_nodes`, `cached_nodes`, `outputs`, `failing_node`, `memory_runtime`, `memory_theory`, `budget_ratio`, `mitigations`, `result_class` |
| 9 | Tuning report | `{workflow_slug}/09-tuning.md` | `baseline`, `candidates`, `metrics`, `winner`, `rejected`, `remaining_bottleneck` |
| 10 | Coverage review | `{workflow_slug}/10-coverage-review.md` | `node_id`, `node_type`, `prompt_present`, `full_run`, `smoke_run`, `status`, `evidence` |
| 11 | Delivery package | `{workflow_slug}/11-delivery.md` | `support_statement`, `patches`, `deployment`, `validation`, `outputs`, `known_gaps`, `acceptance_steps` |
| 12 | GUI acceptance/demo package | `{workflow_slug}/12-gui-acceptance.md` plus GUI workflow/config/run record artifacts | `gui_workflow_json`, `model_path_config`, `prepare_script`, `launch_command`, `manual_checklist`, `run_record_template`, `expected_outputs`, `human_signoff_state` |

If a required artifact is missing, the next step must either stop or explicitly state why the missing artifact is not applicable.

When Step 00 finds a hard stop whose source is known but not staged, Step 01 must include a bounded acquisition pass before feasibility and environment deployment. Download or copy exact model files into an isolated workflow cache and clone custom-node repositories there first. Also inspect selected custom-node wrapper code for hidden runtime assets and package-specific cache paths. This does not prove runtime support; it only moves dependencies from `source reachable but not staged` to `staged`. Installation, ComfyUI restart, source audit, and prompt validation remain separate gates.

If a step is repeated after new evidence appears, refresh its dependency-state inputs before writing conclusions. For example, Step 03 inventory must consume the latest `01-assets.csv`, `01-custom-nodes.md`, Step 01 acquisition/cache evidence, and `02-feasibility.md` state instead of repeating stale Step 00 hard stops.

## Cross-step constraints

1. Do not remove, bypass, collapse, or replace workflow nodes to create a fake success.
2. Do not trust `execution_success` without reviewing `node_errors`, intended output nodes, and actual output files.
3. Do not claim source fidelity from a compatibility alias.
4. Do not generalize one branch success to the whole workflow.
5. Do not keep tuning after runtime and theoretical evidence prove a capacity hard stop.
6. Do not call engineering smoke customer-ready without GUI or end-user validation evidence.
7. Do not assume an output/display node is display-only. If its output feeds another node, it is part of the executable path and must be preserved during prompt conversion.
8. Do not treat disconnected notes, examples, bypass utilities, or dead-end nodes as runtime blockers, but keep them visible in inventory so reviewers understand why they are not covered by branch evidence.
9. Do not claim native XPU support from CPU fallback, import success, source availability, or a cloned package. Native XPU claims require a source route plus runtime evidence.
10. Do not treat source audit as only text search. Combine source hits with workflow widget values such as device selectors, attention backend, dtype/quantization, output device, and target resolution.
11. Do not silently change workflow widgets that hard-code CUDA. Record them as workflow/runtime policy blockers until an explicit migration decision is made.
12. Do not treat generic `pip install` success as Intel XPU readiness. Verify the actual PyTorch accelerator build and `torch.xpu.is_available()` before Step 6.
13. Do not blindly install CUDA-only optional custom-node dependencies during Step 5. Use the source audit to choose portable dependencies and record skipped accelerators.
14. Do not promote registration patches to runtime support claims. Startup, `/object_info` registration, branch smoke, and full workflow validation are separate evidence levels.
15. Do not treat `/prompt` as validation-only. A successful `/prompt` POST queues execution; use a no-queue validation path when Step 6 must not run the workflow.
16. Do not merge exporter/schema repair with workflow policy migration. Widget-order fixes can repair the API prompt, but changing `cuda:0`, prompt preset labels, seed ranges, dtype, resolution, or device policy needs an explicit migration decision.
17. Do not treat a runtime-policy validation variant as an original workflow step. It is a Step 6 sub-pass for transparent compatibility validation before Step 7, and it must keep node coverage intact.
18. Do not consider Step 01 complete from workflow-visible selectors alone. Selected custom nodes may introduce hidden runtime assets through wrapper defaults and auto-download calls.
19. Do not consider Step 5 dependency installation complete from registration alone. A workflow-selected node may import optional helpers only inside its runtime function; install or explicitly defer declared portable runtime dependencies and let Step 7 classify any remaining misses.
20. Do not hide ComfyUI cache effects in Step 7. If a rerun passes after a late fix, report which nodes were cached and run a small cache-bust verification when the cached pass would otherwise overstate evidence.
21. Do not call a Step 8 runtime-policy prompt result source-identical original workflow success. Preserve the source boundary and distinguish API, GUI/manual, and customer-facing validation.
22. Do not let temporary preview/comparer outputs be the only retained evidence for target nodes. Copy them into the artifact set or record their history metadata immediately.
23. Do not select a Step 9 tuning winner from incomplete telemetry. If the collector or parser fails, fix it and rerun affected candidates.
24. Do not treat the fastest Step 9 configuration as universally best when it materially reduces memory headroom. Keep the speed winner and the safer fallback separate.
25. Do not compare cold and cached tuning runs unless cache behavior is the tuning target and the report labels it explicitly.
26. Do not treat source-vs-prompt node-count mismatch as a Step 10 blocker until missing prompt nodes are classified. Structural GUI nodes, notes, bypass utilities, and disconnected/reference nodes may be absent from the runtime prompt without being runtime gaps.
27. Do not use cached-node evidence as the only proof for a connected executable node during coverage review.
28. Do not turn Step 10 engineering coverage into delivery/customer approval. It only supports the named validation path.
29. Do not claim Step 12 GUI/manual acceptance until a human has run the prepared GUI workflow in the clean environment and recorded output evidence/sign-off.
30. Do not validate GUI readiness only against localhost when the tester will use a LAN or remote IP. Bind to the tester-visible address, verify `/system_stats` from that URL, and record PID/log/launch flags.
31. Do not treat frontend-only or disconnected GUI utility nodes as runtime blockers during Step 12 object-info checks, but keep them visible in the workflow notes.

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
8. Zimage showed that Step 03 artifact naming must be explicit: `03-inventory.md` can be a single report, but complex workflows may need a split topology report plus a node inventory CSV.
9. Zimage showed that a display output can feed a generation prompt; inventory must trace both upstream and downstream links before labeling a node structural or display-only.
10. Zimage showed that repeated/out-of-order steps must refresh dependency states from newer ledgers, especially after replacement input assets or staged dependency caches are created.
11. Zimage Step 4 showed that source audit must include workflow widget evidence: SeedVR2 source offered SDPA options but the workflow still selected `cuda:0`, which is a separate hard stop for unmodified XPU execution.
12. Zimage Step 4 showed that "no `torch.xpu` implementation found" must be interpreted by node family: ComfyUI core nodes using ComfyUI device abstractions can remain native-XPU candidates, while independent custom nodes without XPU/device abstraction need a fallback, patch, or feature-development classification.
13. Zimage Step 4 showed that high-resolution final upscalers can be both a source-portability gap and a capacity risk; do not advance them to full validation before reduced branch smoke and memory evidence.
14. Zimage Step 5 showed that default PyPI dependency resolution can install CUDA PyTorch wheels on an Intel XPU host; environment deployment must verify and, if needed, replace them with XPU wheels.
15. Zimage Step 5 showed that custom-node requirements can include CUDA-only optional accelerators; install portable minimum dependencies for registration and record skipped CUDA-only packages instead of breaking the XPU environment.
16. Zimage Step 5 showed that a small registration patch can unblock `/object_info` without proving native runtime support; keep registration readiness and execution validation separate.
17. Zimage Step 6 showed that `/prompt` is unsafe as a validation-only mechanism because valid prompts are queued for execution.
18. Zimage Step 6 showed that offline validation must initialize custom nodes through the server startup path when extensions depend on `PromptServer.instance`.
19. Zimage Step 6 showed that exporter widget-order fixes and schema-drift blockers must be reported separately: fixing SeedVR2 widget alignment was conversion repair, while preserving `cuda:0` and old QwenVL values produced valid hard stops.
20. Zimage Step 6b showed that an explicit runtime-policy validation variant belongs inside Step 6, between source-preserving prompt validation and Step 7 branch smoke. It is not part of the original workflow graph and not runtime proof; it is the evidence-backed way to handle approved schema/device policy changes without hiding them.
21. Zimage Step 7 showed that Step 01 must inspect custom-node wrapper defaults and auto-download code: `AIO_Preprocessor` hid `depth_anything_v2_vitl.pth` behind `DepthAnythingV2Preprocessor` and `hf_hub_download()`, so a workflow-visible asset scan missed it.
22. Zimage Step 7 showed that mirror/token downloads must be recorded without secrets: keep endpoint/source, target path, size, and checksum, but never write token values into artifacts.
23. Zimage FLUX2/Klein smoke showed that Step 5 must distinguish registration dependencies from runtime dependencies: `ComfyUI-KJNodes` registered, but `ColorMatch` failed until the declared portable `color-matcher` package was installed.
24. Zimage FLUX2/Klein smoke showed that Step 7 reports must expose cache behavior. After fixing a late downstream dependency, the immediate rerun can reuse cached upstream FLUX outputs; keep that evidence but use a cache-bust verification before claiming the sampler/downstream path passed.
25. Zimage Step 8 showed that full/high-fidelity success can still be a tight capacity result. The runtime-policy prompt completed with peak sampled XPU memory around `95.4%` of physical VRAM, so the correct classification was success with telemetry requirements, not capacity hard stop and not comfortable capacity.
26. Zimage Step 8 showed that summed model file sizes are not enough for a hard-stop claim. The FLUX2/Klein file-size sum exceeded physical VRAM, but staged execution, `PurgeVRAM`, low-VRAM behavior, offload, and SeedVR2 block swap kept actual runtime peak within budget.
27. Zimage Step 9 showed that telemetry tooling must be validated before interpreting benchmark results. An `xpu-smi` JSON schema mismatch produced empty CSVs, so candidates had to be rerun after fixing the collector.
28. Zimage Step 9 showed that the fastest configuration can be tighter on memory. `normalvram` plus SeedVR2 intermediate tensors kept on device improved full-run latency by about `2.4%`, but increased peak memory to about `95.8%` of physical VRAM; the safer `lowvram` baseline remains a valid fallback.
29. Zimage Step 10 showed that coverage review must reconcile GUI workflow nodes, inventory nodes, and runtime-policy prompt nodes. The runtime prompt had fewer nodes than the source workflow because GUI-only structural and disconnected/reference nodes were omitted or collapsed.
30. Zimage Step 10 showed that dead-end executable nodes should be explicit non-output gaps, not hidden successes. Node `18` was preserved in the support statement as disconnected from intended outputs.
31. Zimage Step 10 showed that coverage completeness still has a boundary: complete runtime-policy API node coverage is not source-identical original workflow validation, GUI/manual validation, or customer quality approval.

## Prompt and skill mapping

Use the matching prompt to ask an AI agent to perform a step. Use the matching skill as the reusable method reference while executing that step.

Logical step numbers are authoritative. Some filenames keep older extraction numbers:

| Logical step | Prompt | Skill |
| --- | --- | --- |
| 0. Intake and dependency-source preflight | `prompts/00-intake-preflight-prompt.md` | `skills/00-intake-preflight-skill.md` |
| 1. Asset and custom-node resolution | `prompts/03-asset-and-custom-node-prep-prompt.md` | `skills/03-asset-and-custom-node-prep-skill.md` |
| 2. Feasibility analysis | `prompts/01-feasibility-analysis-prompt.md` | `skills/01-feasibility-analysis-skill.md` |
| 3. Workflow inventory | `prompts/02-workflow-inventory-prompt.md` | `skills/02-workflow-inventory-skill.md` |
