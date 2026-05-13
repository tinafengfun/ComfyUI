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
  -> intake and dependency-source preflight
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
  -> GUI/manual acceptance and demo
```

The flow is evidence-gated. A later step should not claim success if an earlier artifact is missing.

## Step-by-step operating map

| Step | Use these docs | Required output | Human intervention point |
| --- | --- | --- | --- |
| 0. Intake and dependency-source preflight | `../prompts/00-intake-preflight-prompt.md`, this README, `QUICKSTART.md`, and any project `model_repo` / custom-node source notes | `00-intake-preflight.md` with workflow path, target output folder, model roots, custom-node roots, remote/source repositories, access status, and unresolved source gaps | Human provides missing model repositories, private assets, custom-node package sources, credentials outside the artifact, or confirms that unresolved dependencies should block migration. |
| 1. Feasibility analysis | `../prompts/01-feasibility-analysis-prompt.md`, `../skills/01-feasibility-analysis-skill.md`, `../templates/intel-xpu-hardware-reference.md` | `01-feasibility.md` with target, hardware budget, fidelity, result route, and assumptions | Human confirms target fidelity, acceptable reduced-resource tier, CPU offload policy, and whether a capacity-risk workflow should proceed. |
| 2. Workflow inventory | `../prompts/02-workflow-inventory-prompt.md`, `../skills/02-workflow-inventory-skill.md` | `02-inventory.md`, or `02-workflow-topology.md` plus `02-node-inventory.csv`, with branch map, executable nodes, structural nodes, output nodes, disconnected nodes, and export risks | Human clarifies ambiguous branches, expected outputs, or whether all branches are in scope. |
| 3. Asset and custom-node prep | `../prompts/03-asset-and-custom-node-prep-prompt.md`, `../skills/03-asset-and-custom-node-prep-skill.md` | `03-assets.csv`, `03-custom-nodes.md`, and when sources are known but not local, `03-acquisition-log.md` with the isolated staging root, copied models, cloned custom-node repos, hidden runtime assets, wrapper-source evidence, commits, and unresolved gaps | Human provides private/proprietary assets, approves smoke-only aliases, approves dependency downloads into an isolated workflow cache or mirror, or decides that missing source-identical assets block delivery. |
| 4. Source audit | `../prompts/04-source-audit-prompt.md`, `../skills/04-source-audit-skill.md` | `04-source-audit.md` with CUDA/XPU risks, workflow widget/device evidence, patch class, route, and validation needed | Human decides whether CUDA-only paths or CUDA-hard-coded widgets become feature-development work, CPU fallback, workflow/runtime policy changes, or out-of-scope gaps. |
| 5. Environment deployment | `../prompts/05-environment-deployment-prompt.md`, `../skills/05-environment-deployment-skill.md`, `../templates/intel-xpu-hardware-reference.md` | `05-environment.md` with actual software stack, XPU wheel proof, launch command, model paths, API registration evidence, patch notes, and installed/skipped/deferred dependency notes | Human provides target machine access, approves fresh deployment assumptions, resolves blocked package installs, or approves any registration/runtime policy patch. |
| 6. Prompt conversion validation | `../prompts/06-prompt-conversion-validation-prompt.md`, `../skills/06-prompt-conversion-validation-skill.md` | `06-prompt.json`, `06-prompt-validation.json`, and when needed `06-prompt-validation.md`, conversion notes, or `06b-runtime-policy-*` variant artifacts with validation method, queue status, `node_errors`, and validated outputs | Human decides how to handle unrepresentable GUI-only behavior, prompt-export gaps, or schema/runtime-policy fixes that would change workflow semantics. |
| 7. Branch smoke validation | `../prompts/07-branch-smoke-validation-prompt.md`, `../skills/07-branch-smoke-validation-skill.md` | `07-{branch_slug}-smoke.md` plus prompt, history, logs, outputs, executed/cached-node evidence, and dependency-gap evidence | Human confirms reduced settings are faithful enough for smoke and accepts or rejects visual/media output quality for smoke tier. |
| 8. Full validation and capacity | `../prompts/08-full-validation-and-capacity-prompt.md`, `../skills/08-full-validation-and-capacity-skill.md`, `../templates/intel-xpu-hardware-reference.md` | `08-full-validation.md` with full-run status, memory evidence, theory, result class, and escalation | Human decides whether to pursue activation-level engineering, multi-XPU, reduced-fidelity delivery, or capacity hard stop. |
| 9. Performance tuning | `../prompts/09-performance-tuning-prompt.md`, `../skills/09-performance-tuning-skill.md` | `09-tuning.md` with baseline, candidate matrix, metrics, winner, and rejected candidates | Human chooses optimization target and decides when tuning is no longer worth the risk or time. |
| 10. Coverage review | `../prompts/10-coverage-review-prompt.md`, `../skills/10-coverage-review-skill.md` | `10-coverage-review.md` with every executable node covered by full run, smoke, or explicit gap | Human approves support statement when coverage includes gaps, CPU fallback, or smoke-only branches. |
| 11. Delivery packaging | `../prompts/11-delivery-packaging-prompt.md`, `../skills/11-delivery-packaging-skill.md`, `../templates/migration-result-report-template.md` | `11-delivery.md` or filled migration result report with patches, deployment, validation, outputs, gaps, and acceptance steps | Human approves customer-facing wording, known limitations, manual GUI validation, and final release readiness. |
| 12. GUI acceptance and demo | `../prompts/12-gui-acceptance-demo-prompt.md`, `../skills/12-gui-acceptance-demo-skill.md` | `12-gui-acceptance.md`, clean GUI environment script/config, runtime-policy GUI workflow JSON, and run record template | Human runs the workflow end to end in the prepared GUI environment and signs off on generated outputs. |

If the table is hard to read in a narrow Markdown viewer, use the step cards below. They contain the same operating intent without relying on wide columns.

## Step cards

### Step 0: Intake and dependency-source preflight

- **Docs**: `../prompts/00-intake-preflight-prompt.md`, this README, `QUICKSTART.md`, and project-specific source notes such as `model_repo`
- **Output**: `00-intake-preflight.md`
- **Human intervention**: provide missing model roots, custom-node repositories, private inputs, or repository access. Keep credentials out of artifacts.
- **Boundary**: this step does not install models or modify code. It only proves whether dependency sources are known and reachable enough for feasibility routing.

### Step 1: Feasibility analysis

- **Docs**: `../prompts/01-feasibility-analysis-prompt.md`, `../skills/01-feasibility-analysis-skill.md`, `../templates/intel-xpu-hardware-reference.md`
- **Output**: `01-feasibility.md`
- **Human intervention**: confirm fidelity target, hardware budget, reduced-resource acceptance, CPU offload policy, dependency gaps, and whether capacity-risk work should proceed.

### Step 2: Workflow inventory

- **Docs**: `../prompts/02-workflow-inventory-prompt.md`, `../skills/02-workflow-inventory-skill.md`
- **Output**: `02-inventory.md`, or split output `02-workflow-topology.md` plus `02-node-inventory.csv`
- **Human intervention**: clarify ambiguous output branches and decide whether every branch is in scope.
- **Boundary**: inventory is still non-runtime analysis. It may consume updated Step 3 asset/custom-node state if available, but it does not install, register, run, bypass, or edit workflow nodes.
- **Zimage lesson**: trace both upstream and downstream links. A node that looks like a display output can still feed a runtime prompt, and disconnected bypass/example nodes should be recorded without treating them as validation blockers.

### Step 3: Asset and custom-node prep

- **Docs**: `../prompts/03-asset-and-custom-node-prep-prompt.md`, `../skills/03-asset-and-custom-node-prep-skill.md`
- **Output**: `03-assets.csv`, `03-custom-nodes.md`; if dependency sources are known but not staged, also `03-acquisition-log.md`
- **Human intervention**: provide private assets, approve smoke-only aliases, approve download/staging into an isolated workflow cache, or decide that source-identical gaps block delivery.
- **Boundary**: acquisition/staging is not runtime validation. Downloading a model or cloning a custom-node repo only changes the dependency state to `staged`; install/registration, source audit, and prompt validation still happen later.
- **Hidden asset rule**: inspect selected custom-node wrapper source for runtime auto-downloads and defaults that do not appear in workflow JSON, such as preprocessor `ckpt_name`, `from_pretrained()`, `hf_hub_download()`, `snapshot_download()`, and package-specific cache paths.
- **Credential rule**: if a mirror or token is used, record only non-sensitive evidence such as endpoint/source, target path, size, checksum, and whether a token was used. Never copy token values into artifacts.

### Step 4: Source audit

- **Docs**: `../prompts/04-source-audit-prompt.md`, `../skills/04-source-audit-skill.md`
- **Output**: `04-source-audit.md`
- **Human intervention**: decide whether CUDA-only paths are normal migration work, CPU fallback, feature development, or out of scope.
- **Boundary**: source audit must read both source code and workflow widget values. Device selectors like `cuda:0`, CUDA-only attention backends, dtype/quantization choices, output device, and target resolution can be hard stops even when the package has some fallback code.
- **Zimage lesson**: do not claim native XPU from source availability or CPU fallback. A ComfyUI-core node that uses ComfyUI device abstractions may remain a native-XPU candidate, but an independent custom node with no `torch.xpu` path or framework device abstraction must be classified as fallback, patch-required, or feature-development gap.

### Step 5: Environment deployment

- **Docs**: `../prompts/05-environment-deployment-prompt.md`, `../skills/05-environment-deployment-skill.md`, `../templates/intel-xpu-hardware-reference.md`
- **Output**: `05-environment.md`
- **Human intervention**: provide machine access, approve fresh deployment assumptions, or resolve blocked installs.
- **Boundary**: startup is not workflow validation, and package import is not node-family registration. Verify the exact target node types through `/object_info` before moving to prompt validation.
- **XPU rule**: prove `torch.xpu.is_available()` and record the actual PyTorch wheel build. If dependency installation pulled a CUDA wheel, replace it with an XPU build before continuing.
- **Dependency rule**: do not blindly install custom-node requirements that include CUDA-only optional accelerators. Use the Step 4 source audit to install portable minimum dependencies and record skipped CUDA-only packages.
- **Runtime dependency rule**: registration is not enough. For workflow-selected node classes, check package requirements and node source for portable libraries imported inside runtime functions; install them or record them as deferred environment gaps.
- **Patch rule**: registration patches may be applied and recorded in Step 5, but they only prove environment readiness. Branch smoke is still required before native-XPU runtime claims.

### Step 6: Prompt conversion validation

- **Docs**: `../prompts/06-prompt-conversion-validation-prompt.md`, `../skills/06-prompt-conversion-validation-skill.md`
- **Output**: `06-prompt.json`, `06-prompt-validation.json`
- **Human intervention**: decide how to handle GUI-only behavior, prompt-export gaps, or schema/runtime-policy fixes that would change workflow semantics.
- **Boundary**: `/prompt` is not validation-only; successful validation queues execution. Use a no-queue path such as `execution.validate_prompt()` when this step must not run the workflow.
- **Variant rule**: if a source-preserving prompt fails only on known target runtime-policy or current-schema values, create a clearly named Step 6 variant such as `06b-runtime-policy-prompt.json`. This is not an original workflow step, not branch smoke, and not a new main phase.
- **Zimage lesson**: keep exporter repair, source-preserving validation, and policy-variant validation separate. Fixing SeedVR2 widget-order drift was conversion repair; changing preserved `cuda:0`, old QwenVL preset strings, or oversized seeds belongs in an explicit runtime-policy variant with change notes.

### Step 7: Branch smoke validation

- **Docs**: `../prompts/07-branch-smoke-validation-prompt.md`, `../skills/07-branch-smoke-validation-skill.md`
- **Output**: `07-{branch_slug}-smoke.md` plus prompt, notes, request, response, history, summary, evidence, before/after, logs, and output artifacts
- **Human intervention**: confirm reduced settings are faithful enough and review smoke-tier output quality.
- **History rule**: report both executed and cached nodes. If a branch passes after a late dependency fix by reusing cached upstream outputs, label the evidence as cache-assisted and run a small cache-bust verification when practical.
- **Dependency-gap rule**: if a downstream node fails on a declared missing Python package after upstream compute succeeded, preserve the failed attempt, classify it as an environment dependency gap, install the declared portable dependency, and rerun without bypassing the node.
- **Completion rule**: finish every critical branch family before Step 8, or mark the branch blocked/out of scope with evidence. One passing branch is not whole-workflow readiness.

### Step 8: Full validation and capacity

- **Docs**: `../prompts/08-full-validation-and-capacity-prompt.md`, `../skills/08-full-validation-and-capacity-skill.md`, `../templates/intel-xpu-hardware-reference.md`
- **Output**: `08-full-validation.md`
- **Human intervention**: choose activation-level engineering, multi-XPU, reduced-fidelity delivery, or capacity hard stop.
- **Boundary**: if Step 8 uses `06b-runtime-policy-prompt.json` or another policy/schema variant, classify the result as runtime-policy validation, not source-identical workflow validation. Keep API, GUI/manual, and customer-facing validation claims separate.
- **Capacity rule**: static model-file sums are only a warning. Declare capacity hard stop only when runtime telemetry and static reasoning agree. If a full/high-fidelity run succeeds above 80% of budget, classify it as tight success and keep the exact launch/runtime policy and memory telemetry.
- **Artifact rule**: preserve durable output files under the workflow artifact set when possible. For temp-only preview/comparer outputs, copy them or record history metadata immediately so reviewers can still verify target outputs after ComfyUI temp cleanup.

### Step 9: Performance tuning

- **Docs**: `../prompts/09-performance-tuning-prompt.md`, `../skills/09-performance-tuning-skill.md`
- **Output**: `09-tuning.md`
- **Human intervention**: choose optimization target and stop tuning when evidence says the path is capacity- or feature-blocked.
- **Harness rule**: before long tuning runs, prove the benchmark harness captures queue status, history, outputs, cached-node evidence, and at least one valid telemetry sample. If telemetry is empty or malformed, fix and rerun candidates.
- **Winner rule**: the fastest candidate is not automatically the delivery default. If it is near capacity, record both the speed winner and the safer fallback, with explicit use conditions.
- **Cache rule**: compare cold runs to cold runs, or clearly label warm/cache-assisted runs. Do not mix cached and uncached evidence when selecting a winner.

### Step 10: Coverage review

- **Docs**: `../prompts/10-coverage-review-prompt.md`, `../skills/10-coverage-review-skill.md`
- **Output**: `10-coverage-review.md`
- **Human intervention**: approve the support statement when some nodes are smoke-only, CPU fallback, or explicit gaps.
- **Node-count rule**: compare source workflow, inventory, and authoritative prompt node sets, but classify missing prompt nodes before treating them as gaps. GUI-only structural nodes, notes, bypass utilities, and disconnected/reference nodes may be omitted from the runtime prompt.
- **Evidence rule**: keep executed, cached, and output-only evidence separate. Cached evidence can support history context but should not be the only proof for an in-scope executable node.
- **Boundary rule**: coverage review can clear engineering node coverage only for the named validation path. It does not by itself approve source-identical, GUI/manual, or customer-facing validation.

### Step 11: Delivery packaging

- **Docs**: `../prompts/11-delivery-packaging-prompt.md`, `../skills/11-delivery-packaging-skill.md`, `../templates/migration-result-report-template.md`
- **Output**: `11-delivery.md` or filled migration result report
- **Human intervention**: approve customer wording, known limitations, GUI/manual validation requirements, and final release readiness.

### Step 12: GUI acceptance and demo

- **Docs**: `../prompts/12-gui-acceptance-demo-prompt.md`, `../skills/12-gui-acceptance-demo-skill.md`
- **Output**: `12-gui-acceptance.md`, `extra_model_paths.yaml` or equivalent model-path config, clean GUI prepare script, runtime-policy GUI workflow JSON, and manual run record template
- **Human intervention**: run the workflow in the prepared clean GUI environment, inspect generated outputs, record logs/outputs, and sign off or reject.
- **Boundary**: preparing an importable GUI workflow is not the same as GUI/customer acceptance. Acceptance requires a completed human run record with output evidence.
- **Service rule**: bind ComfyUI to the tester-visible address, avoid port conflicts with existing services, verify `/system_stats` from that exact URL, and record PID, launch flags, and server log.
- **Readiness rule**: validate runtime nodes and model selectors through `/object_info`, but classify frontend-only/disconnected nodes before treating missing object-info entries as blockers.

## Result classes

Use the canonical result-class definitions in `../intel-xpu-workflow-migration-flow.md#result-classes`.

Every step report should use exactly one of those classes when it summarizes workflow, branch, or node-family status.

## Human approval gates

Stop and ask for human direction when any of these happen:

1. required source-identical model or input asset is missing
2. the model repository or custom-node source repository is unknown or inaccessible
3. smoke-only alias would affect customer-facing fidelity claims
4. critical custom node depends on CUDA-only architecture
5. workflow widgets hard-code CUDA placement or CUDA-only backend on a critical path
6. prompt conversion changes workflow semantics
7. branch smoke fails on a critical output path
8. full-size run exceeds measured capacity after reasonable mitigation
9. customer delivery would need to say "full success" but evidence is only smoke-level
10. migration work turns into feature development, platform selection, or hardware escalation

## Minimum artifact bundle

For a reviewable migration, keep at least:

1. workflow JSON and dependency-source preflight
2. converted prompt
3. feasibility report
4. inventory and asset ledger
5. source audit
6. environment report
7. prompt validation response
8. branch smoke histories and generated outputs
9. full or highest-fidelity validation report
10. tuning report, if tuning was performed
11. coverage review
12. final migration result report

## Documentation quality gates

Before a migration result is considered reviewable, check these documentation rules:

1. **Validation path is explicit**: distinguish API prompt validation, GUI import, GUI manual validation, and customer-facing validation.
2. **Assumptions are scoped**: hardware labels, allocator behavior, model dtype, and reduced settings must be written as measured facts only when evidence exists.
3. **Boundary cases are visible**: if only one branch variant, frame count, or resolution was tested, say that; do not silently generalize to all variants.
4. **Data scope is labeled**: timing, memory, and output-quality numbers must identify the run, branch, hardware, and telemetry source.
5. **Untested cases stay untested**: do not convert missing evidence into a success claim. Mark it as `untested`, `blocked`, or `out of scope`.

## Quick start example

1. Create `00-intake-preflight.md` from the workflow path, target artifact folder, model roots, custom-node roots, and project source notes such as `model_repo`.
2. Use `../templates/intel-xpu-hardware-reference.md` to map the requested machine label, such as `B60` or `B70`, to measured GPU facts.
3. Run the Step 1 prompt on the workflow JSON and dependency preflight, then produce `01-feasibility.md`.
4. If `initial_class` is `capacity risk` or `environment / integration gap`, pause for a human dependency/fidelity/hardware decision before spending time on deployment.
5. If feasible, run Steps 2-7 sequentially and keep each required artifact. If a later dependency-acquisition step happens before Step 2 is finalized, refresh Step 2 with the latest asset/custom-node states before writing conclusions.
6. At Step 4, audit workflow widget values as well as source. If a critical node is set to `cuda:0`, record a workflow/runtime policy blocker instead of silently changing it.
7. At Step 5, confirm the environment is truly XPU-backed with `/system_stats`, `torch.xpu.is_available()`, and `/object_info` node registration. Do not proceed on CUDA/CPU wheels unless the route is explicitly CPU fallback.
8. At Step 6, use no-queue prompt validation when execution is not allowed, and record whether `/prompt` was avoided or intentionally used.
9. At Step 7, record executed/cached nodes and use cache-bust verification when a post-fix pass depends on cached upstream compute.
10. At Step 8, classify full/high-fidelity status using measured usable VRAM and the capacity matrix. If the run succeeds near the budget limit, call it tight success rather than comfortable capacity, and distinguish runtime-policy success from source-identical workflow success.
11. Fill `../templates/migration-result-report-template.md` before customer or management review.

Example Step 7 instruction:

```text
根据 ComfyUI/docs/draft/prompts/07-branch-smoke-validation-prompt.md
和 ComfyUI/docs/draft/skills/07-branch-smoke-validation-skill.md，
使用 <workflow_slug>/06b-runtime-policy-prompt.json 作为 validated prompt，
对以下分支执行 branch smoke：

1. text/prompt branch: partial_execution_targets=["60"], optional seed cache-bust
2. first-stage: partial_execution_targets=["16"], reduced settings: node 1 scale_to_length=512, node 2 resolution=512, sampler steps reduced, output prefix isolated
3. refinement: partial_execution_targets=["26","27","36"], reduced settings: refinement canvas and scheduler steps reduced, output prefix isolated
4. final-upscale/video: partial_execution_targets=["72","94","52"], reduced settings: final resolution/frame/batch limits reduced, output prefix isolated

不要修改 source workflow，不要 bypass 节点。每个分支都必须保存 prompt、notes、request、history、summary、evidence、输出文件和报告。
```

Minimal command-oriented checklist:

```text
00-intake-preflight.md -> measure hardware -> 01-feasibility.md
-> 02-inventory.md or 02-workflow-topology.md / 02-node-inventory.csv
-> 03-assets.csv / 03-custom-nodes.md
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
| Zimage source audit | Source and workflow-widget audit | Source audit must include workflow widget values and must distinguish native-XPU candidate, CPU fallback, workflow/runtime policy blocker, and feature-development gap. | That a staged repo, importable package, or CPU fallback is native-XPU support. |
| Zimage environment deployment | Startup and registration evidence | XPU wheel proof, model/custom-node wiring, `/system_stats`, and `/object_info` establish environment readiness for prompt validation. | That a registration patch or node presence in `/object_info` proves branch smoke or full workflow success. |
| Zimage prompt conversion validation | Validation-only Step 6 evidence | No-queue validation can expose preserved workflow hard stops such as `cuda:0`, old QwenVL preset values, and seed range mismatches after exporter fixes are separated. | That changing those values is approved, or that branch smoke/full execution has succeeded. |
| Zimage Step 7 branch smoke | Reduced branch-smoke evidence | QwenVL text output `60`, first-stage output `16`, FLUX2/Klein outputs `26/27/36`, and SeedVR2 outputs `72/94/52` executed through preserved graph branches on XPU at reduced settings. | Full-size capacity, original 3840/7680 SeedVR2 target, full workflow success, GUI manual validation, or customer-facing quality. |
| Zimage Step 8 full/high-fidelity validation | Full/high-fidelity runtime-policy API evidence | The runtime-policy prompt completed high-fidelity targets `16/26/27/36/52/60/72/94`, including `3840x5760` SeedVR2 output, with peak sampled XPU memory about `95.4%` of physical VRAM. | Source-identical original workflow validation, GUI/manual validation, customer-facing quality approval, or comfortable capacity margin. |
