# Intel XPU full reproduction guide for `Dasiwa-图生视频流.json`

This guide starts from the original workflow JSON and ends with:

- a validated API prompt
- an optional branch prescreen
- a full benchmark run
- output verification
- timing and XPU artifact review

## Scope

Workflow source:

- `/path/to/cartoon/Dasiwa-图生视频流.json`

Repository root:

- `/path/to/ComfyUI`

Best current full-run path:

- keep the default CPU-biased prompt policy
- launch with `--disable-ipex-optimize --lowvram --reserve-vram 1.5`
- do **not** use `--cpu-vae`

## Variables used below

```bash
WORKFLOW_JSON=/path/to/cartoon/Dasiwa-图生视频流.json
PROMPT_JSON=/tmp/perf-baseline-prompt.json
NOFORCE_PROMPT_JSON=/tmp/perf-noforce-prompt.json
INPUT_DIR=/path/to/comfy-inputs
OUTPUT_DIR=/path/to/comfy-output
PERF_DB=sqlite:////tmp/comfy-perf.db
```

## Step 0: enter the repo and environment

```bash
cd /path/to/ComfyUI
. .venv-xpu/bin/activate
```

Quick environment check:

```bash
python3 - <<'PY'
import torch
print('xpu_available', torch.xpu.is_available())
PY
```

## Step 1: check whether the GGUF custom-node patch is already present

The nested `ComfyUI-GGUF` repository is separate from the parent repo. Do not blindly re-apply the patch.

Inspect the nested diff first:

```bash
cd /path/to/ComfyUI/custom_nodes/ComfyUI-GGUF
git diff -- nodes.py
cd /path/to/ComfyUI
```

If the local GGUF loader does **not** already expose `device=["default","cpu"]`, apply:

```bash
cd /path/to/ComfyUI/custom_nodes/ComfyUI-GGUF
git apply ../../patches/comfyui-gguf-xpu-device-routing.patch
cd /path/to/ComfyUI
```

## Step 2: generate the baseline prompt from the workflow JSON

```bash
python3 script_examples/workflow_to_prompt.py \
  "${WORKFLOW_JSON}" \
  > "${PROMPT_JSON}"
```

Optional experimental prompt that keeps original loader placement:

```bash
python3 script_examples/workflow_to_prompt.py \
  --no-force-cpu \
  "${WORKFLOW_JSON}" \
  > "${NOFORCE_PROMPT_JSON}"
```

Validate the generated prompt:

```bash
python3 - <<'PY'
import json
path = '/tmp/perf-baseline-prompt.json'
prompt = json.load(open(path))
print('nodes', len(prompt))
for nid in ['203', '204', '245', '315', '408']:
    assert nid in prompt, nid
print('validated')
PY
```

## Step 3: run the static memory assessment

```bash
python3 script_examples/workflow_memory_assessor.py \
  "${PROMPT_JSON}" \
  --search-root /tmp/hf_models \
  --search-root /home/intel/hf_models \
  --vram-limit-gb 24
```

What to look for:

- `missing_models` should be empty
- recommendations should still prefer conservative placement for loader-heavy pieces
- if the estimate exceeds the 24 GB budget, do not promote that path to a full run without a prescreen

## Step 4: start ComfyUI with the tuned full-run configuration

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

Wait until the server is reachable:

```bash
curl -sf http://127.0.0.1:8188/system_stats | head
```

## Step 5: optional branch prescreen

This is the fastest way to test a risky placement idea before spending a full run.

```bash
python3 script_examples/workflow_perf_runner.py \
  "${PROMPT_JSON}" \
  --path-id smoke-245 \
  --output-node 245 \
  --filename-prefix-base smoke245 \
  --launch-flags="--database-url ${PERF_DB} --disable-ipex-optimize --lowvram --reserve-vram 1.5" \
  --prompt-command="python3 script_examples/workflow_to_prompt.py ${WORKFLOW_JSON} > ${PROMPT_JSON}" \
  --prompt-policy="baseline CPU-biased loader policy" \
  --notes="branch 245 prescreen"
```

Artifacts appear in:

- `temp/perf-runs/smoke-245/prompt.json`
- `temp/perf-runs/smoke-245/history.json`
- `temp/perf-runs/smoke-245/xpu.csv`
- `temp/perf-runs/smoke-245/report.json`

## Step 6: run the full benchmark

Current winning path:

```bash
python3 script_examples/workflow_perf_runner.py \
  "${PROMPT_JSON}" \
  --path-id R1-VAE-on-XPU \
  --filename-prefix-base R1-VAE-on-XPU \
  --launch-flags="--database-url ${PERF_DB} --disable-ipex-optimize --lowvram --reserve-vram 1.5 --input-directory ${INPUT_DIR} --output-directory ${OUTPUT_DIR}" \
  --prompt-command="python3 script_examples/workflow_to_prompt.py ${WORKFLOW_JSON} > ${PROMPT_JSON}" \
  --prompt-policy="baseline loader policy with VAE on XPU" \
  --notes="current best full-run path"
```

## Step 7: validate the output files

Validate the benchmark report itself:

```bash
python3 - <<'PY'
import json
from pathlib import Path
report = json.loads(Path('temp/perf-runs/R3-VAE-on-XPU-plus-NoForceCPU/report.json').read_text())
for asset in report['outputs']:
    file_info = asset.get('file')
    if not file_info:
        continue
    assert file_info['exists'], asset
    assert file_info['size_bytes'] > 0, asset
print('report outputs validated')
PY
```

Inspect one produced MP4 directly:

```bash
ffprobe -v error \
  -show_entries stream=codec_name,width,height,r_frame_rate,nb_frames,duration \
  -of json \
  "${OUTPUT_DIR}/R3-VAE-on-XPU-plus-NoForceCPU-245_00001.mp4"
```

Expected shape from the validated runs:

- codec: `h264`
- size: `480x832`
- frame rate: `16 fps`
- frames: `81`
- duration: about `5.06s`

## Step 8: inspect timing and XPU artifacts

The most useful files are:

- `history.json`: raw execution history including outputs
- `report.json`: summarized node timings, XPU summary, output metadata
- `xpu.csv`: raw sampled XPU telemetry

Quick summary:

```bash
python3 - <<'PY'
import json
from pathlib import Path
report = json.loads(Path('temp/perf-runs/R3-VAE-on-XPU-plus-NoForceCPU/report.json').read_text())
print('prompt_ms', report['prompt_end_ms'] - report['prompt_start_ms'])
print('xpu_summary', report['xpu_summary'])
print('top_nodes')
for item in report['node_summary']['nodes'][:8]:
    print(item)
PY
```

## Step 9: interpret the result

For this workflow, the key question is whether VAE decode or sampling dominates the wall time.

Current verified conclusion:

- baseline bottleneck: `VAEDecode`
- best fix: remove `--cpu-vae`
- non-winning idea: pushing more loaders back toward default/XPU

## Step 10: stop the server

If you started the server in the foreground, `Ctrl+C` is enough.

If it was backgrounded:

```bash
PID=$(lsof -t -iTCP:8188 -sTCP:LISTEN | head -n1)
if [ -n "$PID" ]; then
  kill "$PID"
fi
```

## Related documents

- `docs/intel-xpu-workflow-performance-tuning.md`
- `docs/intel-xpu-workflow-tuning-skill.md`
- `docs/intel-xpu-workflow-deployment.md`
- `/home/intel/tianfeng/comfy/e2e_test.md`
