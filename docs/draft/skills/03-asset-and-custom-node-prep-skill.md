# Asset and custom-node prep skill

## Use when

Use after workflow inventory to make dependencies explicit.

## Inputs

- workflow inventory
- model roots and caches
- custom-node directory
- approved download sources
- dependency-source preflight and any hard-stop list
- isolated workflow cache path, if acquisition is approved

## Algorithm

1. Extract all model and workflow-side asset references.
2. For each selected custom-node class, inspect wrapper source for implicit assets and runtime downloads: `from_pretrained()`, `hf_hub_download()`, `snapshot_download()`, `load_file()`, `torch.load()`, default `ckpt_name`, model-name dictionaries, and package cache/config paths.
3. Search local roots before remote sources.
4. Classify each dependency as `staged`, `source reachable but not staged`, `source unknown`, `access blocked`, `runtime-auto-download hidden asset`, or `smoke-only alias candidate`.
5. If the remaining hard stop is source-known but not staged, run a bounded acquisition pass: copy/download exact model files into an isolated workflow cache that mirrors both ComfyUI's model layout and the custom node's expected cache layout.
6. Clone source-known custom-node repositories into the isolated workflow cache and record commits.
7. Do not label a cloned custom-node repository as installed or registered until environment deployment and prompt validation prove it.
8. Label every asset as resolved, compatibility alias, or unresolved.

## Common failure signatures

- LoRA/checkpoint selector path fails `value_not_in_list`
- missing `LoadImage` input blocks smoke
- nested custom-node repo ignored by parent git repo
- alias silently described as original asset
- source-known dependencies left unstaged, causing the same hard stop to reappear at deployment
- cloned custom-node source incorrectly reported as registered without a ComfyUI restart and prompt validation
- hidden preprocessor/checkpoint default missed because it is not visible in the workflow JSON
- custom node tries `hf_hub_download()` or `snapshot_download()` during branch smoke
- model is staged in a generic ComfyUI folder but the custom node expects its own package cache path
- mirror or token is needed for download, but credentials are accidentally copied into artifacts

## Evidence standard

Retain asset ledger, source mapping, wrapper-source evidence for hidden runtime assets, acquisition log, custom-node commit list, install logs when installation actually happens, and remaining hard-stop list.

When using mirrors or credentials, retain only non-sensitive evidence: endpoint/mirror name, repo or source URL, target path, size, checksum, and whether a token was used. Do not retain the token value.

## Hard stops

Stop if a critical source-identical asset is missing and no approved alias/fallback exists.

Stop before deployment if critical dependencies are only `source reachable but not staged`; acquire or stage them first in an isolated workflow cache.

Stop before branch smoke if a selected custom-node wrapper has a runtime auto-download path and the required file is not already staged in the exact path that wrapper checks.

## Output schema

`asset_name`, `requested_name`, `resolved_path`, `source`, `state`, `staged_path`, `custom_node_repo`, `custom_node_cache_path`, `wrapper_source_evidence`, `commit`, `install_status`, `acquisition_status`, `mirror_used`, `credential_recorded`, `gap`.
