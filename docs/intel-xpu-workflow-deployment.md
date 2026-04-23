# Intel XPU workflow deployment guide

This guide documents the deployment flow that successfully migrated and ran `cartoon/Dasiwa-图生视频流.json` on Intel XPU without removing or bypassing any workflow node.

## Scope

- Intel XPU target with ~24 GB VRAM
- ComfyUI core plus external custom nodes
- Wan 2.x video workflows that mix safetensors UNets and GGUF UNets

## What is included in this repository

- Core loader/device routing changes in:
  - `comfy/sd.py`
  - `nodes.py`
- Migration utilities in:
  - `script_examples/workflow_to_prompt.py`
  - `script_examples/workflow_branch_runner.py`
  - `script_examples/workflow_memory_assessor.py`
  - `script_examples/xpu_memory_dashboard.py`
  - `utils/prompt_subgraph.py`
- A patch file for the external `ComfyUI-GGUF` repository:
  - `patches/comfyui-gguf-xpu-device-routing.patch`

## What is intentionally not committed here

The parent ComfyUI repository ignores `custom_nodes/`, and `custom_nodes/ComfyUI-GGUF` is its own nested git repository. The GGUF loader change used during migration is preserved as a patch file instead of being committed into this parent repository.

## Model inventory

The migrated workflow used these model families:

- Wan text encoder: `umt5_xxl_fp8_e4m3fn_scaled.safetensors`
- Wan VAE: `wan_2.1_vae.safetensors`
- CLIP Vision: `clip_vision_h.safetensors`
- Wan safetensors UNets:
  - `smoothMix_Wan2214B-I2V_i2v_V20_High.safetensors`
  - `smoothMix_Wan2214B-I2V_i2v_V20_Low.safetensors`
- Wan GGUF UNets:
  - `smoothMix_Wan22-I2V_V20_highQ4KM.gguf`
  - `smoothMix_Wan22-I2V_V20_lowQ4KM.gguf`
  - `smoothMix_Wan22-T2V_V20_highQ6K.gguf`
  - `smoothMix_Wan22-T2V_V20_lowQ6K.gguf`
- Workflow LoRAs under `models/loras/` or an external model root

Use `extra_model_paths.yaml` or `--search-root` inputs to point ComfyUI and the assessor at your actual model directories.

## One-time preparation

1. Apply the external GGUF patch if you need the `device=cpu` input on GGUF UNet loaders:

   ```bash
   cd custom_nodes/ComfyUI-GGUF
   git apply ../../patches/comfyui-gguf-xpu-device-routing.patch
   ```

2. Place model roots where ComfyUI can resolve them, or configure `extra_model_paths.yaml`.

3. Ensure the workflow JSON still contains all original nodes. The successful migration did not bypass or remove any node.

## Recommended ComfyUI launch flags

There are now two validated launch profiles:

1. **Conservative migration fallback**
2. **Performance-tuned winner**

Conservative fallback:

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

Performance-tuned winner:

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

Why:

- `--disable-ipex-optimize`: avoids the known GGUF/XPU incompatibility path
- `--lowvram`: reduces pressure from oversized Wan branches
- `--reserve-vram 1.5`: leaves headroom so sampling is less likely to OOM
- `--cpu-vae`: still works as the conservative fallback
- removing `--cpu-vae` is the best verified performance path for this workflow after tuning

## Convert workflow JSON to API prompt

The converter normalizes Windows-style paths, keeps the graph intact, disables the known XPU-incompatible Sage/FP16-accumulation settings, and by default forces the CPU-biased loader defaults that worked for this migration.

```bash
python script_examples/workflow_to_prompt.py cartoon/Dasiwa-图生视频流.json > /tmp/dasiwa-api-prompt.json
```

If you want to preserve the workflow's original loader-device settings and only keep the safety overrides for Sage attention and fp16 accumulation:

```bash
python script_examples/workflow_to_prompt.py \
  --no-force-cpu \
  cartoon/Dasiwa-图生视频流.json > /tmp/dasiwa-api-prompt.json
```

## Preflight memory assessment

Run the assessor before queueing the workflow:

```bash
python script_examples/workflow_memory_assessor.py \
  /tmp/dasiwa-api-prompt.json \
  --search-root /home/intel/hf_models \
  --vram-limit-gb 24
```

You can also set shared model roots through `COMFY_MODEL_SEARCH_ROOTS`, using your platform path separator.

Use the result to identify:

- unresolved model names
- branches that exceed the 24 GB XPU budget
- which loaders should stay CPU-biased

## Live VRAM monitoring

Start the dashboard in a second terminal:

```bash
python script_examples/xpu_memory_dashboard.py \
  --comfy-url http://127.0.0.1:8188 \
  --device 0 \
  --port 8787
```

Open `http://127.0.0.1:8787` to watch:

- ComfyUI VRAM totals
- `xpu-smi` memory/power/utilization
- warnings when free VRAM gets too low
- `xpu-smi diag --precheck` on demand

The dashboard refuses non-localhost bind addresses unless `--allow-remote` is passed explicitly.

## Branch isolation before full runs

Isolate a single output branch first:

```bash
python script_examples/workflow_branch_runner.py \
  /tmp/dasiwa-api-prompt.json \
  --output-node 245 \
  --steps 4 \
  --seed 123456 \
  --filename-prefix Video/bench-245 \
  --submit \
  --server 127.0.0.1:8188
```

Use this to:

- reproduce failures on the tail branch
- test a device-placement idea with the same seed
- compare timing between placement variants

## Full deployment checklist

1. Start ComfyUI with the flags above.
2. Convert workflow JSON to API prompt.
3. Run `workflow_memory_assessor.py`.
4. Fix unresolved model names and verify aliases.
5. Run branch tests with `workflow_branch_runner.py`.
6. Queue the full prompt only after the branch tests are clean.
7. Verify all final outputs exist and inspect the preview PNGs/videos.

## Device placement that worked best

For this workflow on this machine after tuning:

- Keep **sampling on XPU**
- Keep **VAE on XPU** for the fastest full-run path
- Keep **ImageResizeKJv2 on CPU**
- Keep **text encoder and UNet loaders CPU-biased at prompt level**

The most important benchmark findings were:

- baseline full run with `--cpu-vae`: `1740847 ms`
- tuned full run without `--cpu-vae`: `695612 ms`
- hybrid `--no-force-cpu` plus VAE-on-XPU full run: `694597 ms`, effectively tied but with higher peak memory

The old counterintuitive result still holds for loader placement:

- current CPU-biased loader placement: faster than reverting loaders back to `default`
- moving more loaders onto XPU did not beat the default CPU-biased converter policy

The heavier Wan sampling still uses XPU in practice even when loaders are configured with `device=cpu`, so the mixed placement remains valid. See `docs/intel-xpu-workflow-performance-tuning.md` for the round-by-round benchmark log and `docs/intel-xpu-workflow-tuning-skill.md` for the reusable tuning method.
