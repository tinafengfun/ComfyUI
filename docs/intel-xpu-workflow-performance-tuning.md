# Intel XPU workflow performance tuning report

This report captures verified Intel XPU tuning patterns and case data after workflows were already running successfully.

## Cross-workflow corrections

Two verified Dasiwa-family workflows now show why the tuning method must stay measurement-first:

| Workflow | Real bottleneck | Verified winner |
| --- | --- | --- |
| `cartoon/Dasiwa-图生视频流.json` | `VAEDecode` dominated the baseline | remove `--cpu-vae` |
| `cartoon/DaSiWa-WAN2.2图生视频流-支持单图_双图_三图出视频json.json` | sampler stages (`sampler_high_noise` + `sampler_low_noise`) consumed about `90%` of node time | keep the conservative baseline; removing `--lowvram` or enabling default IPEX optimize did not beat the full baseline |

That second case also forced two harness corrections that are now part of the reusable method:

1. flatten nested output-entry lists when summarizing `history.outputs`
2. do not fail the whole report when `ffprobe` is unavailable; keep file existence/size and mark probe metadata as unavailable

For the full original-workflow tuning writeup and synced raw artifacts, see:

- `docs/artifacts/original-remote/性能调优报告.md`
- `docs/artifacts/original-remote/perf/`

For the reusable catalogue of optimization options and stop conditions, see:

- `docs/intel-xpu-optimization-research.md`

## Reproduction variables

Use your own local paths when rerunning these commands:

```bash
WORKFLOW_JSON=/path/to/cartoon/Dasiwa-图生视频流.json
PROMPT_JSON=/tmp/perf-baseline-prompt.json
NOFORCE_PROMPT_JSON=/tmp/perf-noforce-prompt.json
INPUT_DIR=/path/to/comfy-inputs
OUTPUT_DIR=/path/to/comfy-output
PERF_DB=sqlite:////tmp/comfy-perf.db
```

## Goal

Find the fastest stable configuration for the full workflow without bypassing nodes or changing workflow semantics.

## Measurement method

The benchmark harness is `script_examples/workflow_perf_runner.py`.

It records:

- prompt id
- per-node start/end/duration from `execution.py`
- XPU samples from `xpu-smi stats -e -j`
- output files and media metadata from `history` + `ffprobe`
- launch flags, prompt conversion command, and prompt policy

## Verified corrections to the older E2E notes

The older local E2E notes previously contained stale assumptions. The important corrections are:

| Old assumption | Current verified result |
| --- | --- |
| `workflow_to_prompt.py` still mishandles `mode=4` bypassed nodes | Do not assume this. The current repository state should be treated as fixed unless a fresh repro proves otherwise. |
| `--cpu-vae` is still the best deployment default | Safe fallback only. It is no longer the best measured performance path. |
| GGUF patch must always be re-applied before testing | False. Reapply only if the nested `ComfyUI-GGUF` checkout does not already contain the local change. |

## Benchmark rounds

### Commands used

Baseline prompt:

```bash
python3 script_examples/workflow_to_prompt.py \
  "${WORKFLOW_JSON}" \
  > "${PROMPT_JSON}"
```

No-force-CPU prompt:

```bash
python3 script_examples/workflow_to_prompt.py \
  --no-force-cpu \
  "${WORKFLOW_JSON}" \
  > "${NOFORCE_PROMPT_JSON}"
```

Conservative baseline launch:

```bash
python3 main.py \
  --listen 127.0.0.1 \
  --port 8188 \
  --database-url "${PERF_DB}" \
  --disable-ipex-optimize \
  --lowvram \
  --cpu-vae \
  --reserve-vram 1.5 \
  --input-directory "${INPUT_DIR}" \
  --output-directory "${OUTPUT_DIR}"
```

VAE-on-XPU launch:

```bash
python3 main.py \
  --listen 127.0.0.1 \
  --port 8188 \
  --database-url "${PERF_DB}" \
  --disable-ipex-optimize \
  --lowvram \
  --reserve-vram 1.5 \
  --input-directory "${INPUT_DIR}" \
  --output-directory "${OUTPUT_DIR}"
```

### Results table

| Path | Scope | Prompt policy | Launch delta | Wall time | Peak XPU mem | Key result | Decision |
| --- | --- | --- | --- | ---: | ---: | --- | --- |
| `R0-Baseline` | full | CPU-biased loader policy | `--cpu-vae` on | `1740847 ms` | `21304.8 MiB` | Stable reference; `VAEDecode` dominated total node time | Keep as baseline only |
| `R1-VAE-on-XPU` | full | CPU-biased loader policy | remove `--cpu-vae` | `695612 ms` | `21888.9 MiB` | Huge decode-stage win; no cache reuse; stable outputs | **Winner** |
| `R3-NoForceCPU-245` | branch 245 | `--no-force-cpu` | baseline launch | `653459 ms` | `21219.6 MiB` | Produced no upside over the CPU-biased branch validation path | Pruned |
| `R3-Hybrid-245` | branch 245 | `--no-force-cpu` | remove `--cpu-vae` | `364426 ms` | `24478.6 MiB` | Fast prescreen, but already too close to the 24 GB budget | Escalated cautiously |
| `R3-VAE-on-XPU-plus-NoForceCPU` | full | `--no-force-cpu` | remove `--cpu-vae` | `694597 ms` | `22107.8 MiB` | Nearly tied with `R1`, but no real speed win and slightly higher memory | Lose to `R1` |

### Visual comparison

Full-run wall time:

| Path | Wall time | Relative bar |
| --- | ---: | --- |
| `R0-Baseline` | `1740847 ms` | `████████████████████████████████████████` |
| `R1-VAE-on-XPU` | `695612 ms` | `████████████████` |
| `R3-VAE-on-XPU-plus-NoForceCPU` | `694597 ms` | `████████████████` |

Full-run peak XPU memory:

| Path | Peak memory | Relative bar |
| --- | ---: | --- |
| `R0-Baseline` | `21304.8 MiB` | `███████████████████████████████████████` |
| `R1-VAE-on-XPU` | `21888.9 MiB` | `████████████████████████████████████████` |
| `R3-VAE-on-XPU-plus-NoForceCPU` | `22107.8 MiB` | `████████████████████████████████████████` |

Branch 245 prescreen wall time:

| Path | Wall time | Relative bar |
| --- | ---: | --- |
| `R3-NoForceCPU-245` | `653459 ms` | `████████████████████████████████████████` |
| `R3-Hybrid-245` | `364426 ms` | `██████████████████████` |

Branch 245 peak XPU memory:

| Path | Peak memory | Relative bar |
| --- | ---: | --- |
| `R3-NoForceCPU-245` | `21219.6 MiB` | `███████████████████████████████████` |
| `R3-Hybrid-245` | `24478.6 MiB` | `████████████████████████████████████████` |

## Why `R1-VAE-on-XPU` wins

The decisive bottleneck in the baseline run was VAE decode.

### Baseline dominant stages

| Stage | Node time |
| --- | ---: |
| `vae_decode` | `784850 ms` |
| `encoding` | `340203 ms` |
| `sampler_high_noise` | `306778 ms` |
| `sampler_low_noise` | `306435 ms` |

### `R1-VAE-on-XPU` dominant stages

| Stage | Node time |
| --- | ---: |
| `sampler_low_noise` | `306415 ms` |
| `sampler_high_noise` | `305102 ms` |
| `encoding` | `44616 ms` |
| `vae_decode` | `32324 ms` |

### Main interpretation

1. The biggest baseline bottleneck was not sampling. It was VAE decode.
2. Moving VAE decode back to XPU collapsed that cost from `784850 ms` to `32324 ms`.
3. The total `R0` → `R1` win is larger than the decode delta alone because the recorded `encoding` stage also dropped from `340203 ms` to `44616 ms` in the same CPU-biased prompt-policy comparison.
4. Reverting more loaders to default/XPU did not create an additional full-run benefit. The hybrid path tied `R1` instead of beating it, while consuming more memory.

## XPU utilization summary

### `R0-Baseline`

- samples: `699`
- peak memory: `21304.8 MiB`
- average compute engine group utilization: `38.09%`
- average EU active: `18.26%`

Stage slices from the saved baseline report showed:

- `sampler_high_noise`: average compute engine utilization around `98.28%`
- `sampler_low_noise`: average compute engine utilization around `98.85%`
- `vae_decode`: low average utilization relative to time spent

That mismatch is exactly why decode-stage optimization had so much upside.

### `R1-VAE-on-XPU`

- samples: `279`
- peak memory: `21888.9 MiB`
- average compute engine group utilization: `91.79%`
- average EU active: `46.61%`

### `R3-VAE-on-XPU-plus-NoForceCPU`

- samples: `278`
- peak memory: `22107.8 MiB`
- average compute engine group utilization: `93.11%`
- average EU active: `47.17%`

`R3` raised utilization slightly, but not enough to beat `R1` on wall-clock time.

## Output validation

The successful full-run paths produced:

- output nodes: `245`, `315`, `408`
- H.264 MP4 files
- `480x832`
- `16 fps`
- `81` frames
- duration about `5.06s`

These three videos should not be interpreted as three near-duplicate renders of one branch. They come from different workflow outputs with different semantics:

- `245`: image-conditioned boxing branch using `WanImageToVideo`
- `315`: text-only video branch using `EmptyHunyuanLatentVideo`; this is why it can legitimately diverge into the elf / ballroom-style result
- `408`: another boxing branch using `WanFirstLastFrameToVideo`

The large visual gap between `315` and `245` / `408` is therefore expected workflow behavior, not evidence that the migration or tuning run broke branch routing.

The runner now records output file presence, size, and `ffprobe` stream metadata in `report.json`.

## Preserved artifact locations

Current preserved full-run artifact directory:

- `temp/perf-runs/R3-VAE-on-XPU-plus-NoForceCPU/`

Committed output copies:

- `docs/artifacts/dasiwa-final-run/R3-VAE-on-XPU-plus-NoForceCPU-245_00001.mp4`
- `docs/artifacts/dasiwa-final-run/R3-VAE-on-XPU-plus-NoForceCPU-315_00001.mp4`
- `docs/artifacts/dasiwa-final-run/R3-VAE-on-XPU-plus-NoForceCPU-408_00001.mp4`

It contains:

- `prompt.json`
- `history.json`
- `xpu.csv`
- `report.json`

The earlier `R0` and `R1` comparisons were captured during the session and summarized in this report. For future tuning rounds, preserve benchmark directories instead of recycling them when comparing finalists.

## Recommended performance configuration

Use this as the current best full-run path:

```bash
python3 main.py \
  --listen 127.0.0.1 \
  --port 8188 \
  --database-url "${PERF_DB}" \
  --disable-ipex-optimize \
  --lowvram \
  --reserve-vram 1.5 \
  --input-directory "${INPUT_DIR}" \
  --output-directory "${OUTPUT_DIR}"
```

and:

```bash
python3 script_examples/workflow_to_prompt.py \
  "${WORKFLOW_JSON}" \
  > "${PROMPT_JSON}"
```

In short:

- keep the current CPU-biased loader defaults
- keep `ImageResizeKJv2` on CPU
- keep low-VRAM mode with `reserve-vram 1.5`
- remove `--cpu-vae`

For a step-by-step reproduction starting from the original workflow JSON, see `docs/intel-xpu-workflow-full-repro-guide.md`.

## Paths not taken further

The broader matrix in the plan included reserve-VRAM and `normalvram` variants plus experimental async-offload. Those were not promoted because the verified bottleneck was already removed by `R1`, while the loader-policy experiments showed that "push more to XPU" was not automatically beneficial. If a later workflow shows a different hotspot distribution, revisit those variants with the same harness instead of assuming this winner generalizes unchanged.
