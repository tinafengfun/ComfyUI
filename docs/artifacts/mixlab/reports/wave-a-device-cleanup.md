# Wave A device cleanup

This report records the first actual Wave A code migration pass for Mixlab's low-cost XPU candidates.

## Patched files

- `custom_nodes/comfyui-mixlab-nodes.disabled/nodes/ClipInterrogator.py`
- `custom_nodes/comfyui-mixlab-nodes.disabled/nodes/TextGenerateNode.py`
- `custom_nodes/comfyui-mixlab-nodes.disabled/nodes/Lama.py`

## What changed

### `ClipInterrogator`

- switched runtime device selection from hardcoded `cuda/cpu` branching to `comfy.model_management.get_torch_device()`
- changed caption-model dtype selection to use Comfy's `should_use_fp16` / `should_use_bf16`
- kept offload on CPU, but now routes cache cleanup through `comfy.model_management.soft_empty_cache()`

### `TextGenerateNode`

- switched translation and prompt-generation model placement to Comfy's execution device
- replaced hardcoded Hugging Face pipeline device strings with a `torch.device` from Comfy
- moved CPU offload cleanup to `comfy.model_management.soft_empty_cache()`

### `Lama`

- moved wrapper placement to Comfy's execution device instead of `cuda/cpu` checks
- normalized post-run CPU offload and cache cleanup through Comfy

## Current validation

Validated in the current `.venv-xpu` environment:

1. Python compile succeeded for all three patched files
2. isolated module imports succeeded for all three patched files
3. helper resolution in the current environment now reports:
   - `ClipInterrogator` -> `xpu`
   - `TextGenerateNode` -> `xpu`
   - `Lama` -> `xpu`
4. retained XPU runtime smoke now exists for the text-generation family:
   - `docs/artifacts/mixlab/logs/wave-a-textgenerate-xpu.log`
   - `docs/artifacts/mixlab/logs/wave-a-chineseprompt-xpu.log`
5. retained XPU runtime smoke now also exists for `LaMa`:
   - `docs/artifacts/mixlab/logs/wave-a-lama-xpu.log`
6. retained XPU runtime smoke now also exists for `ClipInterrogator`:
   - `docs/artifacts/mixlab/logs/wave-a-clipinterrogator-xpu.log`

## Remaining gap before promotion

`ClipInterrogator`, `PromptGenerate_Mix` / `ChinesePrompt_Mix`, and `LaMa` can now be treated as **narrow XPU smoke-backed**.

The remaining unvalidated work is now outside these three core Wave A families.

Remaining requirements:

- `ClipInterrogator`
  - optional next step: stage BLIP and ci-preprocess cache locally so the current smoke no longer depends on remote downloads or fallback preprocessing
- `TextGenerateNode`
  - optional next step: stage local prompt-generator and zh-en models so the current smoke no longer depends on remote model download
- `Lama`
  - optional next step: document and replay the current `--no-deps` install workaround more cleanly inside package install notes
  - broaden smoke beyond the minimal synthetic image/mask case
  - confirm behavior under the final packaged environment

## Current blockers observed during this pass

### `LaMa`

- a normal `pip install simple_lama_inpainting` still fails in this Python 3.13 environment during wheel build
- retained failure log: `docs/artifacts/mixlab/logs/wave-a-lama-install.log`
- however, `pip install --no-deps simple_lama_inpainting==0.1.2` works in the current `.venv-xpu`
- after staging `big-lama.pt`, retained XPU smoke succeeded in the current environment
- so the current status is no longer “blocked”; it is “works with a packaging workaround, needs reproducible install notes”

## Migration meaning

This pass removes the most obvious **package-local GPU infra gap** for the first Wave A targets and advances all three planned core families to retained XPU smoke.

What remains is now mostly:

1. dependency preparation
2. local model/cache staging for reproducibility
3. broader family-level coverage for the remaining helper families

That is the expected handoff point from **core device cleanup** into **reproducibility hardening + package closeout**.
