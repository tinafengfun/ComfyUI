# Dasiwa B70 patch package

## Files

- `ComfyUI-main.patch`
  - B70 asset search/staging scripts
  - `workflow_asset_inventory.py` alias normalization
  - `workflow_to_prompt.py` widget-only node export fixes
  - `workflow_branch_runner.py` output-directory fix
  - smoke / full-size probe helper scripts
- `ComfyUI-original-branch54-fix.patch`
  - selector-name basename normalization for `LoraLoaderModelOnly`
  - prevents `/prompt` `value_not_in_list` validation failures when workflow exports `Wan/...` LoRA names
  - includes matching unit-test coverage
- `ComfyUI-LaoLi-lineup.patch`
- `ComfyUI_Qwen3-VL-Instruct.patch`
- `Comfyui_Prompt_Edit.patch`
- `ComfyUI-Easy-Use.patch`

## Notes

- The custom-node patches are reused from the earlier B60 migration but were rebuilt from the current repo diffs so the patch artifacts are valid and reversible again.
- The B70 case depends on the same custom-node XPU adjustments plus additional ComfyUI-side tooling fixes for prompt conversion and asset preparation.
