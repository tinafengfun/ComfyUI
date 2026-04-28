# Intel XPU workflow tuning skill

Use this skill when a ComfyUI workflow already runs on Intel XPU and the next task is to make it faster without changing workflow semantics.

For a reusable **task prompt + execution plan template**, see `docs/intel-xpu-workflow-tuning-prompt.md`.
For the reusable **optimization candidate catalogue**, see `docs/intel-xpu-optimization-research.md`.

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

Also preserve the raw bundle even if the summary step fails:

- `prompt.json`
- `history.json`
- `xpu.csv`

That raw bundle must be enough to regenerate `report.json` offline after a harness fix.

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
6. If the best measured path still exceeds the theoretical or runtime memory budget, record that as a blocked case instead of tuning around it indefinitely.
7. If a finalist full run has already exceeded a completed baseline wall time and still has not produced the same output set, stop it and record it as slower-than-baseline.

## Candidate catalogue

Generate paths from the measured bottleneck class, not from a random knob list:

| Bottleneck class | First candidate types |
| --- | --- |
| decode-bound | VAE placement, decode tiling, post-sampler cleanup before decode |
| sampler-bound | attention/kernel-path work, sampler-compatible memory controls, branch pruning, capacity-limit check |
| residency / budget-bound | `--lowvram`, reserve headroom, CPU-loaded/XPU-executed placement, family CPU fallback |
| startup / import overhead | package bootstrap hardening, lazy import, remove import-time auto-installs |

Use `docs/intel-xpu-optimization-research.md` when building or rejecting those candidates.

## Common false assumptions

### False assumption: more XPU placement is always faster

Wrong. In this workflow, reverting more loaders to default/XPU did not beat the CPU-biased loader policy.

### False assumption: the sampler is always the dominant bottleneck

Wrong. The baseline winner here came from fixing `VAEDecode`, not from changing sampler behavior.

### False assumption: the previous workflow's winner carries over unchanged

Wrong. The older `cartoon/Dasiwa-图生视频流.json` case was decode-bound, but the original `DaSiWa-WAN2.2...json.json` case spent about `90%` of total node time inside the two sampler stages. Re-measure every workflow.

### False assumption: if lowvram helps one stage, it fixes the whole workflow

Wrong. In the later Wan21 full-size investigation, `--cpu-vae` and `--lowvram` changed where time and memory were spent, but did not remove the decisive denoise activation peak.

### False assumption: high average GPU utilization means the path is best

Wrong. A path can raise utilization and still lose on wall-clock time or memory headroom.

### False assumption: a fast branch prescreen is enough to declare victory

Wrong. Use branch-only runs to prune, not to crown a winner.

### False assumption: removing `--lowvram` automatically removes lowvram behavior

Wrong. On the original DaSiWa WAN2.2 workflow, dropping the flag still left the runtime in partial-load / lowvram-patch behavior under memory pressure, and it produced no meaningful branch win.

## Decision rule

Pick the path with:

1. the lowest full-run wall time
2. valid outputs
3. no cache cheating
4. acceptable peak memory on the 24 GB device
5. the smallest extra complexity when results are otherwise tied
6. and, if no candidate satisfies the memory limit, declare the workflow blocked at that target size

Treat branch deltas below about `1%` as ties until a full-run confirmation proves a real advantage.

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

For the original `cartoon/DaSiWa-WAN2.2图生视频流-支持单图_双图_三图出视频json.json` workflow on the remote 32 GB XPU host, the best verified path remained the conservative full baseline:

- `--disable-ipex-optimize`
- `--lowvram`
- `--reserve-vram 1.5`
- keep the default CPU-biased loader policy from `workflow_to_prompt.py`

Why:

- sampler stages, not VAE decode, dominated the workflow (`~90%` of node time)
- removing `--lowvram` did not improve the measured branch runtime
- enabling default IPEX optimize produced only a branch-level tie-sized gain and then lost to the completed baseline on full-run elapsed time

## Reporting standard

When handing off results, always include:

- the full attempted path list
- which paths were branch-only versus full-run
- exact commands
- winner and runner-up
- top bottleneck nodes for baseline and winner
- peak memory and time delta versus baseline
- any stale assumptions that were disproved during the run
- any harness bug that required regenerating `report.json` from saved raw artifacts

## Companion templates

- `docs/intel-xpu-workflow-tuning-prompt.md`: reusable request prompt, constraints, clarification questions, deliverables, and execution plan
- `docs/intel-xpu-optimization-research.md`: reusable catalogue of optimization classes, risks, and XPU adaptation ideas
- `docs/intel-xpu-workflow-performance-tuning.md`: path comparisons and workflow-specific benchmark evidence
- `docs/intel-xpu-workflow-full-repro-guide.md`: end-to-end reproduction guide
- `docs/intel-xpu-workflow-asset-prep.md`: repeatable custom-node and model inventory / setup flow
