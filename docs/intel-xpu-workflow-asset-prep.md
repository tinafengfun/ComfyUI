# Intel XPU workflow asset preparation guide

Use this guide before running migration or performance work on a large ComfyUI workflow.

The main lesson from this project was simple: **finding the right custom nodes and model files can cost as much time as the XPU tuning itself**. Treat asset preparation as a first-class phase, not as ad-hoc setup.

This guide turns that phase into a repeatable flow with two tools:

- `script_examples/workflow_asset_inventory.py`
- `script_examples/workflow_asset_setup.py`

## What the tools cover

1. Parse either a workflow JSON or an API prompt JSON.
2. List required custom-node packages and the node classes that depend on them.
3. List referenced models and LoRAs.
4. Search one or more local model roots for already-downloaded files.
5. Clone or update known custom-node repositories.
6. Stage found models into the ComfyUI `models/` tree by symlink or copy.
7. Download a subset of known Wan-family models automatically from Hugging Face when a source is known.

## Why this matters

For `cartoon/Dasiwa-图生视频流.json`, the time sinks were not only runtime bottlenecks:

- confirming which custom nodes were actually required
- mapping `cnr_id` and node types back to Git repos
- locating the exact WAN / LoRA / CLIP / VAE files across local caches
- deciding which files could be downloaded automatically and which still needed manual source confirmation

That work should be scripted once and reused.

## Step 1: inventory the workflow

```bash
cd /path/to/ComfyUI
. .venv-xpu/bin/activate

python3 script_examples/workflow_asset_inventory.py \
  /path/to/cartoon/Dasiwa-图生视频流.json \
  --search-root /home/intel/hf_models \
  --search-root /tmp/hf_models
```

What this reports:

- required custom-node packages
- repo URLs for known package mappings
- referenced model names
- whether each model was found locally
- missing assets that still need download or manual placement

For strict CI-style checking:

```bash
python3 script_examples/workflow_asset_inventory.py \
  /path/to/cartoon/Dasiwa-图生视频流.json \
  --search-root /home/intel/hf_models \
  --strict
```

## Step 2: clone or update the required custom nodes

Dry run first:

```bash
python3 script_examples/workflow_asset_setup.py \
  /path/to/cartoon/Dasiwa-图生视频流.json \
  --custom-nodes-dir /path/to/ComfyUI/custom_nodes \
  --clone-custom-nodes \
  --dry-run
```

Apply it:

```bash
python3 script_examples/workflow_asset_setup.py \
  /path/to/cartoon/Dasiwa-图生视频流.json \
  --custom-nodes-dir /path/to/ComfyUI/custom_nodes \
  --clone-custom-nodes \
  --install-requirements
```

This covers the known package mappings used in this workflow:

- `ComfyUI-GGUF`
- `ComfyUI-KJNodes`
- `ComfyUI-VideoHelperSuite`
- `ComfyUI_essentials`
- `ComfyUI_LayerStyle`
- `rgthree-comfy`

## Step 3: stage already-downloaded models into ComfyUI

If models already exist in a shared cache such as `/home/intel/hf_models`, do not re-download them. Stage them into the ComfyUI tree:

```bash
python3 script_examples/workflow_asset_setup.py \
  /path/to/cartoon/Dasiwa-图生视频流.json \
  --search-root /home/intel/hf_models \
  --search-root /tmp/hf_models \
  --model-root /path/to/ComfyUI/models \
  --stage-models \
  --link-mode symlink
```

Use `--link-mode copy` when symlinks are not acceptable.

## Step 4: download known WAN-family models when local caches are incomplete

Some model sources were clear enough to automate directly. For example, the SmoothMix WAN checkpoints can be fetched from Hugging Face:

```bash
export HF_TOKEN=hf_xxx

python3 script_examples/workflow_asset_setup.py \
  /path/to/cartoon/Dasiwa-图生视频流.json \
  --model-root /home/intel/hf_models \
  --download-known-models
```

Notes:

- gated Hugging Face repos still require an accepted access agreement and a valid token
- not every referenced model has a fully verified public source mapping yet
- when a source cannot be resolved automatically, the tool leaves it on the missing list instead of guessing

## Recommended operating sequence

Use this order every time:

1. `workflow_asset_inventory.py` to prove what is missing
2. `workflow_asset_setup.py --clone-custom-nodes` to prepare node repos
3. `workflow_asset_setup.py --stage-models` to reuse local caches
4. `workflow_asset_setup.py --download-known-models` only for the remaining resolvable files
5. rerun `workflow_asset_inventory.py --strict` before the first real workflow execution

## Workflow-specific notes from this migration

For `Dasiwa-图生视频流.json`:

1. The workflow mixes standard ComfyUI nodes with several custom-node packages, so package discovery should never be done by memory alone.
2. Some loaders point at Windows-style relative paths such as `WAN2.2\\...`; the tools normalize these automatically.
3. Several LoRAs are referenced through `Power Lora Loader (rgthree)` widget payloads rather than plain input fields; the inventory tool extracts those too.
4. `ComfyUI-GGUF` is a nested Git repo with a local XPU-related patch in this project. Cloning the upstream repo is only the first step; local patch state still needs verification if you depend on that behavior.

## Deliverable mindset

When handing off a workflow migration or tuning package, the repo should include:

- the asset inventory tool
- the asset setup tool
- the workflow-specific source notes
- any patch files required by nested custom-node repos

That makes future migrations faster and less error-prone than repeating the search process manually.
