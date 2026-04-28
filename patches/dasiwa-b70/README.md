# Dasiwa B70 patch package

This folder is the deployment-facing patch bundle for the Dasiwa WAN2.2 B70/B60 migration output.

## Deployment patch inventory

### 1. ComfyUI core patches

| File | Apply to | Why it is needed |
| --- | --- | --- |
| `ComfyUI-main.patch` | main ComfyUI checkout | B70 asset search/staging scripts, `workflow_asset_inventory.py` alias normalization, `workflow_to_prompt.py` widget-only export fixes, `workflow_branch_runner.py` output-directory fix, smoke/full-size helper scripts |
| `ComfyUI-original-branch54-fix.patch` | main ComfyUI checkout | normalizes `LoraLoaderModelOnly` selector names to basename-only values so `/prompt` validation does not prune branch `54` on original Dasiwa workflows |

### 2. Custom node patches

| File | Target repository | Why it is needed |
| --- | --- | --- |
| `ComfyUI-LaoLi-lineup.patch` | `custom_nodes/ComfyUI-LaoLi-lineup` | XPU-compatible lineup / cleanup behavior used in this workflow |
| `ComfyUI_Qwen3-VL-Instruct.patch` | `custom_nodes/ComfyUI_Qwen3-VL-Instruct` | Qwen3-VL node behavior needed by the prompt-generation / VQA path on XPU |
| `Comfyui_Prompt_Edit.patch` | `custom_nodes/Comfyui_Prompt_Edit` | prompt-edit widget/export behavior used by this workflow |
| `ComfyUI-Easy-Use.patch` | `custom_nodes/ComfyUI-Easy-Use` | Easy-Use node compatibility adjustments required by the migration package |

## What you need to deploy

Apply all of the following together for the published B70 package:

1. main checkout patches
   - `ComfyUI-main.patch`
   - `ComfyUI-original-branch54-fix.patch`
2. custom node patches
   - `ComfyUI-LaoLi-lineup.patch`
   - `ComfyUI_Qwen3-VL-Instruct.patch`
   - `Comfyui_Prompt_Edit.patch`
   - `ComfyUI-Easy-Use.patch`
3. supporting docs and assets
   - `docs/intel-xpu-workflow-release-standard.md`
   - `docs/intel-xpu-workflow-deployment.md`
   - `docs/artifacts/b70/`

## Asset checklist for this patch bundle

| Category | Required files |
| --- | --- |
| core patch artifacts | `ComfyUI-main.patch`, `ComfyUI-original-branch54-fix.patch` |
| custom node patch artifacts | `ComfyUI-LaoLi-lineup.patch`, `ComfyUI_Qwen3-VL-Instruct.patch`, `Comfyui_Prompt_Edit.patch`, `ComfyUI-Easy-Use.patch` |
| workflow reports | `docs/artifacts/b70/workflow 分析.md`, `docs/artifacts/b70/显存分析.md`, `docs/artifacts/b70/comfy 功能分析和xpu差距.md`, `docs/artifacts/b70/完整测试报告.md` |
| deployment / repro docs | `docs/artifacts/b70/部署指南.md`, `docs/artifacts/b70/端到端测试执行复现指南.md` |
| test definitions | `docs/artifacts/b70/测试用例/` |
| generated review assets | `docs/artifacts/b70/generated/` |

## Notes

- The custom-node patches are reused from the earlier B60 migration but were rebuilt from the current repo diffs so the patch artifacts are valid and reversible again.
- The B70 case depends on the same custom-node XPU adjustments plus additional ComfyUI-side tooling fixes for prompt conversion and asset preparation.
- If you are deploying only the original-workflow branch54 fix, you still need the matching main-checkout patch plus the custom-node patch set that the Dasiwa workflow depends on; the branch54 patch is not a standalone deployment package.
