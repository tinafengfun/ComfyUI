# QuickStart: migrate one ComfyUI workflow to Intel XPU

Use this when you already have a workflow JSON and want to start a real migration.

This is the shortest safe path. It keeps the key rules from the Dasiwa migration: do not bypass nodes, do not confuse smoke with full-size success, and do not call a capacity limit a tuning problem.

## Inputs you need

| Input | Example |
| --- | --- |
| Workflow JSON | `cartoon/my-workflow.json` |
| Target machine | B60, B70, remote XPU host, or another measured Intel XPU target |
| Model roots | `models/`, shared model disk, `/tmp/hf_models` |
| Model source notes | `model_repo`, shared storage path, Hugging Face repo list, or private asset handoff note |
| Custom-node root | `custom_nodes/` |
| Custom-node source notes | installed package list, Git repos, workflow author notes, or node-manager mapping |
| Validation target | smoke, full-size, GUI manual validation, or customer delivery |

## Output folder

Create one artifact folder for the workflow:

```text
docs/artifacts/{workflow_slug}/
```

Use stable file names so every step can consume the previous step:

```text
00-intake-preflight.md
01-hardware-baseline.md
01-feasibility.md
02-inventory.md
# or, for complex workflows:
02-workflow-topology.md
02-node-inventory.csv
03-assets.csv
03-custom-nodes.md
04-source-audit.md
05-environment.md
06-prompt.json
06-prompt-validation.json
06-prompt-validation.md
06b-runtime-policy-prompt.json    # only if an explicit policy/schema validation variant is needed
06b-runtime-policy-notes.json
07-{branch_slug}-smoke.md
08-full-validation.md
10-coverage-review.md
11-delivery.md
12-gui-acceptance.md
```

Create `09-tuning.md` only after a validated baseline exists.

## Step 0A: dependency-source preflight

Use:

- `../prompts/00-intake-preflight-prompt.md`

Do this before feasibility. The goal is not to install everything yet; it is to prevent a workflow from being routed as "probably feasible" when the model source or custom-node source is unknown.

Write `00-intake-preflight.md`:

```text
workflow:
artifact_folder:
model_roots_checked:
model_source_notes:
custom_node_roots_checked:
custom_node_source_notes:
remote_or_shared_sources_reachable:
credentials_handling:
obvious_missing_sources:
initial_blockers:
```

Check only source availability and access, not runtime success:

1. Parse the workflow for model filenames, input media names, and custom node type names.
2. Check whether each model root exists and whether it contains exact filenames or likely source directories.
3. Check whether source notes such as `model_repo` identify a reachable shared/remote/source repository. Do not copy credentials into artifacts.
4. Check whether critical custom-node types are installed, mapped by a node-manager/extension map, or still unknown.
5. Mark dependency states as `source known`, `source reachable but not staged`, `source unknown`, or `access blocked`.

Stop for human input if:

1. the model repository/source is unknown
2. the custom-node source for a critical output path is unknown
3. private credentials or proprietary assets are required
4. an input image/video required by the workflow is missing

Step 3 still owns detailed staging, checksums, installation, and final asset/custom-node ledgers. Step 0A only decides whether feasibility can be routed honestly.

Example instruction:

```text
根据 ComfyUI/docs/draft/prompts/00-intake-preflight-prompt.md，
对 <workflow.json> 做 dependency-source preflight。
模型源和 custom-node 源参考 <model_repo 或项目来源说明>。
输出只写到 <artifact_folder>/00-intake-preflight.md。
不要安装模型，不要安装 custom node，不要改 workflow，不要写凭据。
如果模型源或关键 custom-node 源未知，明确列为 hard stop。
```

## Step 0B: measure hardware first

Use:

- `../templates/intel-xpu-hardware-reference.md`

Run on the target machine:

```bash
xpu-smi discovery
xpu-smi stats -d 0 -j
python - <<'PY'
import torch
print(torch.__version__)
print(torch.xpu.is_available())
if torch.xpu.is_available():
    props = torch.xpu.get_device_properties(0)
    print(props)
    print("total_memory", props.total_memory)
PY
```

Write `01-hardware-baseline.md`:

```text
Environment label:
Actual GPU model:
Total VRAM:
Measured usable VRAM:
Driver/runtime:
PyTorch:
IPEX:
ComfyUI commit:
```

If the label is B60/B70, do not rely on the label alone. Resolve it to actual GPU and usable VRAM.

## Step 1: feasibility route

Use:

- `../prompts/01-feasibility-analysis-prompt.md`
- `../skills/01-feasibility-analysis-skill.md`

Write `01-feasibility.md`:

```text
workflow:
target hardware:
fidelity target:
dependency_preflight:
estimated_peak_vram:
initial_class:
risks:
next_step:
human_decision_needed:
```

Stop for human decision if:

1. the result is `capacity risk`
2. full-size is mandatory but the estimate is near/above budget
3. dependency preflight found unknown model or custom-node sources
4. source-identical private assets are required but unavailable
5. the real requirement is not a ComfyUI workflow

## Step 2: inventory the workflow

Use:

- `../prompts/02-workflow-inventory-prompt.md`
- `../skills/02-workflow-inventory-skill.md`

Write `02-inventory.md`, or split the inventory into `02-workflow-topology.md` and `02-node-inventory.csv`, with:

```text
node_count
link_count
output_nodes
branches
critical_path
structural_nodes
disconnected_nodes
custom_node_packages
export_risks
node_inventory
```

Rules:

1. Count actual links from the workflow `links` array, not `last_link_id`.
2. Trace every output node upstream to its critical path.
3. Trace output/display nodes downstream too; if a text/image output feeds another node, it is part of the executable path.
4. List disconnected notes, example nodes, bypass utilities, and dead-end nodes separately from runtime blockers.
5. If Step 3 has already staged assets, cloned nodes, or approved a replacement input before this inventory is finalized, refresh the dependency state from `03-assets.csv`, `03-custom-nodes.md`, and `03-acquisition-log.md`.
6. Do not claim whole-workflow coverage from one branch.

## Step 3: resolve assets and custom nodes

Use:

- `../prompts/03-asset-and-custom-node-prep-prompt.md`
- `../skills/03-asset-and-custom-node-prep-skill.md`

Write:

```text
03-assets.csv
03-custom-nodes.md
03-acquisition-log.md   # only when files/repos are downloaded or staged
```

Asset states must be one of:

```text
resolved and staged
source reachable but not staged
compatibility alias
unresolved source
```

If Step 0 or Step 1 found a hard stop but the dependency source is now known, run a dependency acquisition pass before environment deployment:

```text
1. create an isolated workflow cache, for example /home/intel/hf_models/{workflow_slug}/
2. copy/download exact model files into cache subfolders that mirror ComfyUI layout and any custom-node-specific cache layout
3. clone required custom-node repositories into cache/custom_nodes/
4. inspect selected custom-node wrapper source for hidden runtime assets such as `from_pretrained()`, `hf_hub_download()`, `snapshot_download()`, default `ckpt_name`, and package cache directories
5. record file sizes, source paths, repo URLs, commits, wrapper-source evidence, and anything still missing
6. do not write credentials into artifacts
7. do not claim custom nodes are installed or registered until Step 5/6 proves it
```

Example acquisition instruction:

```text
根据 03-assets.csv 和 03-custom-nodes.md，
把 source reachable but not staged 的模型和 custom node 源下载到 /home/intel/hf_models/<workflow_slug>/。
模型按 ComfyUI 目录结构暂存到 models/ 子目录，custom node 仓库 clone 到 custom_nodes/ 子目录。
同时检查已选 custom node wrapper 中的默认 ckpt、from_pretrained、hf_hub_download、snapshot_download 和私有 cache 路径。
输出 03-acquisition-log.md，记录源路径、目标路径、文件大小、repo commit、wrapper-source evidence 和剩余 hard stop。
如果用 mirror/token 下载，只记录 mirror/source、目标路径、大小和 checksum，不要把凭据写入产物，不要声称已经完成 ComfyUI 安装/注册。
```

Compatibility aliases are smoke-only unless source identity is proven.

## Step 4: source audit

Use:

- `../prompts/04-source-audit-prompt.md`
- `../skills/04-source-audit-skill.md`

Write `04-source-audit.md`.

Check at least:

```text
.cuda()
torch.cuda.*
hard-coded "cuda"
custom CUDA kernels
SageAttention / FlashAttention / SDP assumptions
ONNX provider assumptions
dtype assumptions
IPEX / torch.xpu compatibility
workflow widget device/backend/dtype/output/resolution values
```

If a critical-path node is CUDA-only, classify it honestly as CPU fallback, environment gap, feature-development gap, or blocked.

Rules:

1. Audit the workflow JSON widget values as well as source. A source package may expose a safer mode while the workflow still selects `cuda:0`.
2. Do not silently change CUDA widgets during source audit. Record them as workflow/runtime policy blockers for Step 5/6 decision.
3. Keep native XPU, CPU fallback, environment gap, and feature-development gap separate.
4. If no `torch.xpu` path is found, interpret the result by node family: ComfyUI core nodes may still be candidates through ComfyUI device management, but independent custom nodes need a fallback, patch, or hard-stop classification.
5. Record capacity red flags such as very large upscaler targets, but leave measured capacity decisions to Step 8.

## Step 5: deploy the environment

Use:

- `../prompts/05-environment-deployment-prompt.md`
- `../skills/05-environment-deployment-skill.md`

Write `05-environment.md`.

Before launching, verify the PyTorch accelerator build. A generic `pip install -r requirements.txt` can install CUDA wheels on an Intel XPU host:

```bash
python - <<'PY'
import torch
print(torch.__version__)
print(torch.xpu.is_available())
if torch.xpu.is_available():
    print(torch.xpu.get_device_name(0))
PY
```

If the wheel is CUDA-only or `torch.xpu.is_available()` is false, replace it with the matching XPU wheel set before continuing.

Start conservatively:

```bash
python main.py \
  --listen 127.0.0.1 \
  --port 8188 \
  --disable-ipex-optimize \
  --lowvram \
  --reserve-vram 1.5 \
  --use-pytorch-cross-attention
```

Record:

```text
repo commit
venv
python
torch
torchvision
torchaudio
xpu_available
ipex
driver
level zero
launch command
model paths
custom nodes
registration status
system_stats
object_info
local patches
skipped CUDA-only optional dependencies
```

Rules:

1. Startup success is not workflow success.
2. Verify required node types through `/object_info`; do not rely only on import logs.
3. Install custom-node dependencies using the source audit. Avoid CUDA-only optional accelerators unless explicitly approved.
4. For workflow-selected node classes, also install or record portable runtime dependencies imported inside node functions; `/object_info` registration can succeed without proving those runtime imports.
5. Record symlinked model paths or `extra_model_paths.yaml` entries so Step 6 can explain missing model errors.
6. If a custom node needs a registration patch, save a patch artifact and label it as registration readiness, not runtime success.

## Step 6: convert and validate the API prompt

Use:

- `../prompts/06-prompt-conversion-validation-prompt.md`
- `../skills/06-prompt-conversion-validation-skill.md`

Write:

```text
06-prompt.json
06-prompt-validation.json
```

Check:

```text
node_errors
validated_outputs
missing_inputs
pruned_outputs
```

Do not continue if the intended output node is missing, pruned, or blocked by validation errors.

Rules:

1. Do not POST to `/prompt` for validation-only work unless execution is intentionally allowed. A successful `/prompt` POST queues the prompt.
2. Prefer a no-queue validation path such as ComfyUI `execution.validate_prompt()` when the step must not run the workflow.
3. Initialize custom nodes through the same startup path as ComfyUI before offline validation; some extensions need `PromptServer.instance`.
4. Record exporter fixes separately from workflow/runtime policy changes.
5. Do not silently rewrite `cuda:0`, preset labels, seed ranges, dtype, resolution, or device policy just to pass validation.
6. If those values must change to match the target runtime, create a clearly labeled Step 6 variant such as `06b-runtime-policy-prompt.json`; do not edit the source workflow or pretend this is a node from the original graph.
7. Step 7 may use the validated policy variant, but smoke success must still be reported separately from prompt validation.

## Step 7: run branch smoke

Use:

- `../prompts/07-branch-smoke-validation-prompt.md`
- `../skills/07-branch-smoke-validation-skill.md`

Write `07-{branch_slug}-smoke.md` for each important branch.

Copy/paste prompt:

```text
根据 ComfyUI/docs/draft/prompts/07-branch-smoke-validation-prompt.md
和 ComfyUI/docs/draft/skills/07-branch-smoke-validation-skill.md，
对 <workflow_slug> 执行 Step 7 branch smoke validation。

输入：
- validated API prompt: <workflow_slug>/06b-runtime-policy-prompt.json
- topology/branch map: <workflow_slug>/02-workflow-topology.md
- ComfyUI endpoint: http://127.0.0.1:8188
- branches:
  1. <branch_slug>: partial_execution_targets=<target_output_nodes>, reduced settings=<node.input=value>
  2. <branch_slug>: partial_execution_targets=<target_output_nodes>, reduced settings=<node.input=value>

要求：
- 不改 source workflow
- 不 bypass 节点
- 每个分支保存 prompt、notes、request、submit-response、history、summary、evidence、before/after 和报告
- 检查输出文件存在且非空
- 记录 executed_nodes、cached_nodes、dependency_fixes、cache_bust_verification
- 如果失败，保留 attempt artifact，按失败节点分类，不要用绕过节点制造通过
```

Record:

```text
branch
output_node
variant
settings
history
outputs
executed_nodes
cached_nodes
placement
validation_path
dependency_fixes
cache_bust_verification
status
untested_variants
gap
```

Rules:

1. smoke success is not full-size success
2. API success is not GUI manual validation
3. single-image success is not double/triple-image success
4. untested variants must stay `untested variant`
5. if a rerun passes after fixing a late blocker, record which nodes were cached
6. if cached evidence would overstate branch coverage, run a safe cache-bust verification such as changing a seed/output prefix while preserving the graph
7. if a node fails on a declared missing portable dependency, classify it as an environment dependency gap and rerun after installing the dependency; do not bypass the node

Zimage Step 7 example:

| Branch | Targets | Reduced settings | Result |
| --- | --- | --- | --- |
| QwenVL text output | `["60"]` | seed cache-bust only | passed, `Zimage/07-qwenvl-text-smoke.md` |
| first-stage Z-Image/ControlNet | `["16"]` | image/preprocessor size and sampler steps reduced | passed, `Zimage/07-first-stage-smoke.md` |
| FLUX2/Klein refinement | `["26","27","36"]` | refinement canvas and scheduler steps reduced; cache-bust verification used after dependency fix | passed, `Zimage/07-flux-refine-smoke.md` |
| SeedVR2 final upscale | `["72","94","52"]` | final resolution/max resolution and VAE tile size reduced | passed, `Zimage/07-seedvr2-smoke.md` |

This example proves reduced-setting branch reachability only. It does not prove full-size capacity or GUI/customer validation.

## Step 8: full validation and capacity triage

Use:

- `../prompts/08-full-validation-and-capacity-prompt.md`
- `../skills/08-full-validation-and-capacity-skill.md`

Write `08-full-validation.md`.

If the run fails, retain:

```text
failing node
model path
input shape
free memory
required memory
runtime log
XPU telemetry
static estimate
mitigation attempts
```

If the run succeeds, still retain:

```text
validated prompt path
source-identical vs runtime-policy variant boundary
partial_execution_targets, if used
executed/cached node counts
output files, dimensions, and durable artifact copies
temporary preview/comparer evidence copied or recorded before cleanup
runtime peak memory
usable/physical VRAM
peak/budget ratio
static model and activation reasoning
next validation boundary
```

Capacity decision:

| Runtime required vs usable budget | Action |
| --- | --- |
| `< 80%` | continue normal validation |
| `80-100%` | continue with telemetry |
| `100-120%` | allow one bounded mitigation if justified |
| `> 120%` | stop if static reasoning also agrees; classify capacity hard stop |

Rules:

1. Do not classify from model file sizes alone. File sums can exceed device memory while staged execution, offload, purge, or block-swap keeps the live runtime peak under budget.
2. If a full/high-fidelity run passes above 80% of budget, call it tight success and keep telemetry with the result.
3. If the prompt uses `06b-runtime-policy-prompt.json`, call the result runtime-policy validation. Do not call it source-identical original workflow validation.
4. API validation is not GUI/manual validation or customer quality acceptance.

Zimage Step 8 example:

| Target | Evidence | Result |
| --- | --- | --- |
| `["16","26","27","36","52","60","72","94"]` | `Zimage/08-full-validation.md`, full prompt/history/summary/evidence, output images, memory polls | full/high-fidelity runtime-policy API success; peak sampled memory about `95.4%` of physical VRAM; tight capacity margin |

## Step 9: tune only after baseline

Use:

- `../prompts/09-performance-tuning-prompt.md`
- `../skills/09-performance-tuning-skill.md`

Write `09-tuning.md` only when a validated baseline exists.

Record:

```text
baseline prompt and launch flags
fixed target outputs / partial_execution_targets
candidate matrix
cache policy: cold, warm, or intentionally cache-assisted
telemetry parser/source and validity
wall time and node timings
peak/average memory
output files or output history
winner and safer fallback, if different
rejected candidates and reasons
remaining bottleneck
```

Rules:

1. Validate the benchmark harness before long runs. At minimum, prove one telemetry sample has real memory fields and that history/output capture works.
2. If telemetry is empty or malformed, fix the harness and rerun the affected candidates.
3. Compare cold runs with cold runs unless the target is explicitly repeated/batch throughput.
4. A faster candidate with tighter memory is a speed winner, not automatically the safest delivery default.
5. Do not enable model cache / keep-loaded knobs for single-run delivery unless repeated-run behavior and memory residency are separately tested.

Zimage Step 9 example:

| Candidate | Result | Decision |
| --- | --- | --- |
| `--lowvram --reserve-vram 1.5`, SeedVR2 `offload_device=cpu` | full/high-fidelity success, slower, lower peak memory | safer fallback |
| `--normalvram --reserve-vram 1.5`, SeedVR2 `offload_device=none` | full/high-fidelity success, fastest tested, tighter peak memory | speed winner |

Skip tuning when:

1. prompt validation is broken
2. branch smoke fails
3. the case is already a capacity hard stop
4. the remaining issue is feature development

## Step 10: coverage review

Use:

- `../prompts/10-coverage-review-prompt.md`
- `../skills/10-coverage-review-skill.md`

Write `10-coverage-review.md`.

Record:

```text
source workflow node count
inventory node count
authoritative prompt node count
full-run executed nodes
branch-smoke executed nodes
cached-node evidence
output-only evidence
structural / disconnected / dead-end exclusions
uncovered executable nodes
final support boundary
```

Every executable node must be classified as:

```text
full-run covered
branch-smoke covered
CPU fallback
blocked
untested
structural node
disconnected/reference
dead-end explicit gap
```

Do not publish a full migration claim while executable nodes remain untested.

Rules:

1. A source-vs-prompt node-count mismatch is not automatically a blocker. First classify every missing prompt node.
2. Reroute, Note, disconnected bypass utility, and disconnected/reference nodes can be excluded from runtime gaps only with inventory evidence.
3. Cached-node evidence must be labeled; do not use it as the sole coverage proof for a connected executable node.
4. Coverage review can say engineering node coverage is complete for a named API/runtime-policy path, but it cannot claim GUI/manual validation or customer quality acceptance.

Zimage Step 10 example:

| Finding | Meaning |
| --- | --- |
| Source/inventory `70` nodes; runtime-policy prompt `60` nodes | Missing prompt nodes were structural GUI plumbing or disconnected/reference nodes, not supported runtime-output nodes. |
| `52` nodes full-run covered, `0` uncovered in-scope executables | Runtime-policy API path has complete engineering node coverage. |
| Node `18` explicit non-output gap | Dead-end/disconnected executable, excluded from support claim. |

## Step 11: delivery report

Use:

- `../prompts/11-delivery-packaging-prompt.md`
- `../skills/11-delivery-packaging-skill.md`
- `../templates/migration-result-report-template.md`

Write `11-delivery.md`.

It must include:

```text
result class
target hardware
validation level
branch coverage
node coverage
asset state
patches
hard stops
known gaps
reproduction steps
final support statement
```

## Step 12: GUI acceptance and demo

Use:

- `../prompts/12-gui-acceptance-demo-prompt.md`
- `../skills/12-gui-acceptance-demo-skill.md`

Write `12-gui-acceptance.md`.

It must include:

```text
gui_workflow_json
model_path_config
prepare_script
launch_command
manual_checklist
run_record_template
expected_outputs
known_boundaries
human_signoff_state
```

Rules:

1. Do not modify the source workflow in place.
2. Do not bypass or disable nodes for the demo.
3. Apply patches and configure model paths before GUI validation.
4. If the workflow uses runtime-policy changes, name it as runtime-policy GUI validation, not source-identical validation.
5. A prepared GUI environment is not customer acceptance until a human completes the run record with output evidence.
6. Bind ComfyUI to the address the tester will actually use, such as a LAN IP, and verify `/system_stats` through that URL.
7. Record PID, port, launch flags, server log, workflow checksum, and any non-blocking startup warnings.
8. When checking `/object_info`, parse both list-style and dict-with-`options` schemas; do not treat disconnected frontend utility nodes as runtime blockers.

## Minimal execution chain

```text
dependency-source preflight
-> measure hardware
-> 01-feasibility.md
-> 02-inventory.md or 02-workflow-topology.md / 02-node-inventory.csv
-> 03-assets.csv / 03-custom-nodes.md
-> 04-source-audit.md
-> 05-environment.md
-> 06-prompt.json / 06-prompt-validation.json
-> 07-{branch_slug}-smoke.md
-> 08-full-validation.md
-> 10-coverage-review.md
-> 11-delivery.md
-> 12-gui-acceptance.md
```

## Non-negotiable stop rules

Stop and ask for human direction when:

1. the source repository for required private/source-identical assets is unknown or inaccessible
2. required private/source-identical assets are missing
3. the source repository for a critical custom node is unknown
4. a critical custom node is CUDA-only
5. prompt conversion changes workflow semantics
6. a critical branch cannot smoke
7. full-size exceeds measured hardware capacity
8. customer-facing wording would overstate the evidence

## Final wording rule

Say exactly what is proven:

```text
Branch smoke passed on measured Intel XPU target.
Full-size not proven.
Compatibility aliases used for smoke only.
Capacity hard stop on this hardware.
CPU fallback for this node family.
```

Do not say:

```text
Fully migrated
Source-identical
Customer-ready
All nodes validated
```

unless the retained evidence actually proves it.
