# Intel XPU workflow tuning skill

Use this skill when a ComfyUI workflow already runs on Intel XPU and the next task is to make it faster without changing workflow semantics.

For a reusable **task prompt + execution plan template**, see `docs/intel-xpu-workflow-tuning-prompt.md`.

## Objective

Pick the fastest stable configuration by measurement, not by intuition.

## Tuning algorithm

1. Establish one known-good full-run baseline first.
2. Capture per-node timing and XPU samples for that exact run.
3. Rank bottlenecks by real time share, not by which nodes look "GPU-heavy".
4. Generate a small set of paths that target the measured bottleneck.
5. Use branch-only prescreens to reject obviously bad paths cheaply.
6. Rerun finalists as full workflows with the same harness.
7. Choose the winner by full-run wall time first, then memory safety, then simplicity.

## Measurement standard

Every candidate path should record:

- prompt id
- launch flags
- prompt conversion command
- cache hits
- per-node duration
- stage-level duration share
- XPU memory, utilization, compute engine utilization, EU active
- output file presence and media metadata

If one of those is missing, the path is not fully auditable.

## Stage model

Use these stages to summarize the workflow:

- `preprocess`
- `encoding`
- `model_setup`
- `sampler_high_noise`
- `sampler_low_noise`
- `vae_decode`
- `memory_cleanup`
- `output_postprocess`

The winning optimization usually comes from the stage with the worst mix of:

- high wall-time share
- low useful XPU utilization
- safe room for relocation back to XPU

## Path-generation rules

1. Start from the known-good path.
2. Change one axis at a time unless a branch prescreen already proves a hybrid is promising.
3. Prefer the highest-confidence bottleneck fix first.
4. Do not promote a branch-only win to "best config" without a full-run confirmation.
5. Treat memory headroom as a hard constraint on 24 GB XPU targets.

## Common false assumptions

### False assumption: more XPU placement is always faster

Wrong. In this workflow, reverting more loaders to default/XPU did not beat the CPU-biased loader policy.

### False assumption: the sampler is always the dominant bottleneck

Wrong. The baseline winner here came from fixing `VAEDecode`, not from changing sampler behavior.

### False assumption: high average GPU utilization means the path is best

Wrong. A path can raise utilization and still lose on wall-clock time or memory headroom.

### False assumption: a fast branch prescreen is enough to declare victory

Wrong. Use branch-only runs to prune, not to crown a winner.

## Decision rule

Pick the path with:

1. the lowest full-run wall time
2. valid outputs
3. no cache cheating
4. acceptable peak memory on the 24 GB device
5. the smallest extra complexity when results are otherwise tied

## What won for this workflow

For `cartoon/Dasiwa-图生视频流.json`, the best verified path was:

- `--disable-ipex-optimize`
- `--lowvram`
- `--reserve-vram 1.5`
- keep the default CPU-biased loader policy from `workflow_to_prompt.py`
- remove `--cpu-vae`

Why:

- baseline decode was the dominant time sink
- VAE-on-XPU removed that bottleneck
- `--no-force-cpu` did not create a meaningful full-run gain and cost more memory

## Reporting standard

When handing off results, always include:

- the full attempted path list
- which paths were branch-only versus full-run
- exact commands
- winner and runner-up
- top bottleneck nodes for baseline and winner
- peak memory and time delta versus baseline
- any stale assumptions that were disproved during the run

## Companion templates

- `docs/intel-xpu-workflow-tuning-prompt.md`: reusable request prompt, constraints, clarification questions, deliverables, and execution plan
- `docs/intel-xpu-workflow-performance-tuning.md`: path comparisons and workflow-specific benchmark evidence
- `docs/intel-xpu-workflow-full-repro-guide.md`: end-to-end reproduction guide
