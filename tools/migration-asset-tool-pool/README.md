# Migration asset tool pool

Reusable helpers for Step 01-style ComfyUI migration asset acquisition. The tools search exact local files first, then configured SSH sources, then provider APIs. Downloads are opt-in and credentials stay in runtime environment variables.

## Providers

| Asset type | Sources |
| --- | --- |
| Models | local roots, SSH access node, `hf-mirror.com`, `huggingface.co`, `www.civitai.com`, ModelScope |
| Custom nodes | GitHub repository search, `comfy.icu` |

## Runtime configuration

Use environment variables or an external source notes file. Do not write concrete tokens into generated artifacts.

| Purpose | Variables |
| --- | --- |
| Proxy | `HTTPS_PROXY`, `HTTP_PROXY`, `ALL_PROXY` and lowercase variants |
| HuggingFace / hf-mirror token | `HF_TOKEN`, `HUGGINGFACE_TOKEN`, `HF_MIRROR_TOKEN` |
| HuggingFace endpoint | `HF_ENDPOINT`, `HUGGINGFACE_ENDPOINT`, `HF_FALLBACK_ENDPOINTS` |
| Civitai token | `CIVITAI_TOKEN`, `CIVITAI_API_TOKEN` |
| GitHub token | `GITHUB_TOKEN`, `GH_TOKEN` |
| Enable provider downloads | `ASSET_ACQUISITION_ENABLE_DOWNLOAD=1` |
| Enable/disable provider search | `ASSET_SOURCE_SEARCH=1` or `ASSET_SOURCE_SEARCH=0` |

## Usage

```bash
cd tools/migration-asset-tool-pool
npm install

npm run asset:sources -- search \
  --asset 'flux2/F2K-9B-True-v2-fp8mixed.safetensors' \
  --model-repo /path/to/model_repo \
  --target-root /home/intel/hf_models

ASSET_ACQUISITION_ENABLE_DOWNLOAD=1 npm run asset:sources -- download \
  --asset '4x-UltraSharp.pth' \
  --model-repo /path/to/model_repo \
  --target-root /home/intel/hf_models

npm run asset:sources -- search \
  --kind custom_node \
  --asset ComfyUI-SeedVR2 \
  --model-repo /path/to/model_repo
```

The CLI emits compact JSON with local matches, SSH matches, provider candidates, provider issues, and redacted configuration flags such as `hasHuggingFaceToken`.

## Behavior

1. Search exact local filenames under `--target-root` and registry local directories.
2. Search configured SSH remotes with exact filename matching.
3. Search provider APIs for ranked candidates.
4. Generate resumable `curl` commands for provider downloads and `rsync` for SSH downloads.
5. Optionally verify local-vs-SSH SHA-256 with `--verify-sha`.

The target path router preserves workflow subdirectories and routes common model families to ComfyUI-style directories such as `diffusion_models`, `loras`, `vae`, `text_encoders`, `upscale_models`, and `SEEDVR2`.
