# QuickStart: migrate one ComfyUI workflow to Intel XPU

Use this when you already have a workflow JSON and want to start a real migration.

This is the shortest safe path. It keeps the key rules from the Dasiwa migration: do not bypass nodes, do not confuse smoke with full-size success, and do not call a capacity limit a tuning problem.

## Inputs you need

| Input | Example |
| --- | --- |
| Workflow JSON | `cartoon/my-workflow.json` |
| Target machine | B60, B70, remote XPU host, or another measured Intel XPU target |
| Model roots | `models/`, shared model disk, `/tmp/hf_models` |
| Custom-node root | `custom_nodes/` |
| Validation target | smoke, full-size, GUI manual validation, or customer delivery |

## Output folder

Create one artifact folder for the workflow:

```text
docs/artifacts/{workflow_slug}/
```

Use stable file names so every step can consume the previous step:

```text
01-hardware-baseline.md
01-feasibility.md
02-inventory.md
03-assets.csv
03-custom-nodes.md
04-source-audit.md
05-environment.md
06-prompt.json
06-prompt-validation.json
07-{branch_slug}-smoke.md
08-full-validation.md
10-coverage-review.md
11-delivery.md
```

Create `09-tuning.md` only after a validated baseline exists.

## Step 0: measure hardware first

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
estimated_peak_vram:
initial_class:
risks:
next_step:
human_decision_needed:
```

Stop for human decision if:

1. the result is `capacity risk`
2. full-size is mandatory but the estimate is near/above budget
3. source-identical private assets are required but unavailable
4. the real requirement is not a ComfyUI workflow

## Step 2: inventory the workflow

Use:

- `../prompts/02-workflow-inventory-prompt.md`
- `../skills/02-workflow-inventory-skill.md`

Write `02-inventory.md` with:

```text
node_count
link_count
output_nodes
branches
critical_path
structural_nodes
custom_node_packages
export_risks
```

Do not claim whole-workflow coverage from one branch.

## Step 3: resolve assets and custom nodes

Use:

- `../prompts/03-asset-and-custom-node-prep-prompt.md`
- `../skills/03-asset-and-custom-node-prep-skill.md`

Write:

```text
03-assets.csv
03-custom-nodes.md
```

Asset states must be one of:

```text
resolved and staged
compatibility alias
unresolved source
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
```

If a critical-path node is CUDA-only, classify it honestly as CPU fallback, environment gap, feature-development gap, or blocked.

## Step 5: deploy the environment

Use:

- `../prompts/05-environment-deployment-prompt.md`
- `../skills/05-environment-deployment-skill.md`

Write `05-environment.md`.

Start conservatively:

```bash
python main.py \
  --listen 127.0.0.1 \
  --port 8188 \
  --disable-ipex-optimize \
  --lowvram \
  --reserve-vram 1.5
```

Record:

```text
repo commit
venv
python
torch
ipex
driver
level zero
launch command
model paths
custom nodes
registration status
```

Startup success is not workflow success.

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

## Step 7: run branch smoke

Use:

- `../prompts/07-branch-smoke-validation-prompt.md`
- `../skills/07-branch-smoke-validation-skill.md`

Write `07-{branch_slug}-smoke.md` for each important branch.

Record:

```text
branch
output_node
variant
settings
history
outputs
placement
validation_path
status
untested_variants
gap
```

Rules:

1. smoke success is not full-size success
2. API success is not GUI manual validation
3. single-image success is not double/triple-image success
4. untested variants must stay `untested variant`

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

Capacity decision:

| Runtime required vs usable budget | Action |
| --- | --- |
| `< 80%` | continue normal validation |
| `80-100%` | continue with telemetry |
| `100-120%` | allow one bounded mitigation if justified |
| `> 120%` | stop if static reasoning also agrees; classify capacity hard stop |

## Step 9: tune only after baseline

Use:

- `../prompts/09-performance-tuning-prompt.md`
- `../skills/09-performance-tuning-skill.md`

Write `09-tuning.md` only when a validated baseline exists.

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

Every executable node must be classified as:

```text
full-run covered
branch-smoke covered
CPU fallback
blocked
untested
structural node
```

Do not publish a full migration claim while executable nodes remain untested.

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

## Minimal execution chain

```text
measure hardware
-> 01-feasibility.md
-> 02-inventory.md
-> 03-assets.csv / 03-custom-nodes.md
-> 04-source-audit.md
-> 05-environment.md
-> 06-prompt.json / 06-prompt-validation.json
-> 07-{branch_slug}-smoke.md
-> 08-full-validation.md
-> 10-coverage-review.md
-> 11-delivery.md
```

## Non-negotiable stop rules

Stop and ask for human direction when:

1. required private/source-identical assets are missing
2. a critical custom node is CUDA-only
3. prompt conversion changes workflow semantics
4. a critical branch cannot smoke
5. full-size exceeds measured hardware capacity
6. customer-facing wording would overstate the evidence

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
