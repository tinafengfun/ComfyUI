# Intel XPU workflow deployment conventions

This is the **generic runtime and deployment conventions** note for ComfyUI workflows on Intel XPU.

It is not the primary evidence file for any one workflow. Use workflow-specific delivery bundles and repro guides for case details.

Use this together with:

- `intel-xpu-workflow-migration-skill.md`
- `intel-xpu-workflow-release-standard.md`
- `intel-xpu-workflow-full-repro-guide.md` when a case-specific reproduction path exists

## Scope

This file covers the reusable parts of deployment:

1. environment expectations
2. safe launch profiles
3. prompt conversion conventions
4. preflight checks
5. branch-first runtime validation
6. deployment-side publication expectations

## 1. Environment baseline

Before calling a workflow “deployable”, confirm:

1. the ComfyUI checkout and custom nodes are pinned
2. the Python environment has working Intel XPU PyTorch
3. model roots are reachable through `models/` or `extra_model_paths.yaml`
4. workflow-side input assets are staged
5. any nested custom-node repos and local patches are documented

## 2. Safe launch profiles

Start with a conservative profile unless the workflow already has better retained evidence.

### Conservative baseline

```bash
python main.py \
  --listen 127.0.0.1 \
  --port 8188 \
  --disable-ipex-optimize \
  --lowvram \
  --cpu-vae \
  --reserve-vram 1.5 \
  --input-directory /path/to/comfy-inputs \
  --output-directory /path/to/comfy-output
```

### Performance-oriented variant

Use only after retained measurement proves it wins for the target workflow.

```bash
python main.py \
  --listen 127.0.0.1 \
  --port 8188 \
  --disable-ipex-optimize \
  --lowvram \
  --reserve-vram 1.5 \
  --input-directory /path/to/comfy-inputs \
  --output-directory /path/to/comfy-output
```

### Why these flags are common starting points

- `--disable-ipex-optimize`: avoids backend-specific regressions until the workflow is proven clean
- `--lowvram`: lowers residency pressure for large multi-model workflows
- `--cpu-vae`: conservative fallback when decode placement is still unknown
- `--reserve-vram 1.5`: keeps headroom for allocator instability and XPU budget uncertainty

Do **not** assume the conservative profile is the fastest one. It is just the safest first deployment profile.

## 3. Prompt conversion conventions

The deployment path should use a repeatable workflow-to-prompt conversion step.

Typical expectation:

```bash
python script_examples/workflow_to_prompt.py /path/to/workflow.json > /tmp/workflow-prompt.json
```

Optional variant when a workflow-specific path intentionally preserves original loader placement:

```bash
python script_examples/workflow_to_prompt.py \
  --no-force-cpu \
  /path/to/workflow.json > /tmp/workflow-prompt.json
```

Deployment reviewers should confirm that prompt conversion:

1. preserves required widget-only inputs
2. normalizes selector-backed asset names when needed
3. captures `/prompt` validation response before trusting later runtime results
4. documents any Intel-safe overrides applied outside the original workflow JSON

## 4. Preflight checks before queueing

### 4.1 Memory assessment

Use the static assessor before expensive runs:

```bash
python script_examples/workflow_memory_assessor.py \
  /tmp/workflow-prompt.json \
  --search-root /path/to/model-root \
  --vram-limit-gb 24
```

Review:

- unresolved models
- projected large-model pressure
- whether CPU-biased loader placement is still recommended

### 4.2 Live observability

If the run cost is high, start telemetry in parallel:

```bash
python script_examples/xpu_memory_dashboard.py \
  --comfy-url http://127.0.0.1:8188 \
  --device 0 \
  --port 8787
```

Or collect equivalent `xpu-smi`/JSONL telemetry for the workflow package.

## 5. Branch-first validation

Before a full run, isolate one representative output branch whenever the workflow structure allows it.

Typical pattern:

```bash
python script_examples/workflow_branch_runner.py \
  /tmp/workflow-prompt.json \
  --output-node 123 \
  --steps 4 \
  --seed 123456 \
  --filename-prefix branch-check \
  --submit \
  --server 127.0.0.1:8188
```

Use branch-first runs to:

1. validate custom-node fixes cheaply
2. test one placement idea against a fixed seed
3. reject obviously slower or unstable variants before full reruns

## 6. Deployment checklist

Before publication, confirm:

1. server launch profile is documented
2. prompt conversion command is documented
3. model and input asset staging path is documented
4. required patch bundle is documented
5. branch smoke or equivalent faithful reduced-resource validation exists
6. full-workflow or whole-scenario validation exists where the delivery tier requires it
7. output verification is based on actual files and history, not only console success text

## 7. What belongs in workflow-specific docs instead

Do **not** keep these inside this generic deployment note:

1. one workflow's exact model inventory
2. one workflow's best timing result
3. one workflow's accepted CPU/XPU placement winners
4. one workflow's blocked full-size evidence
5. one workflow's customer validation steps

Those belong in:

- workflow-specific migration reports
- workflow-specific repro guides
- artifact delivery bundles

## 8. Related docs

| Need | Read |
| --- | --- |
| reusable migration method | `intel-xpu-workflow-migration-skill.md` |
| reusable release/package structure | `intel-xpu-workflow-release-standard.md` |
| reusable tuning method | `intel-xpu-workflow-tuning-skill.md` |
| workflow-specific full reproduction example | `intel-xpu-workflow-full-repro-guide.md` |
| canonical customer delivery example | `artifacts/dasiwa-delivery/dasiwa-wan22-delivery.md` |
