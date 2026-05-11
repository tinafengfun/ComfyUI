# Asset and custom-node prep skill

## Use when

Use after workflow inventory to make dependencies explicit.

## Inputs

- workflow inventory
- model roots and caches
- custom-node directory
- approved download sources

## Algorithm

1. Extract all model and workflow-side asset references.
2. Search local roots before remote sources.
3. Stage resolved files into expected ComfyUI paths.
4. Clone/install custom nodes and record commits.
5. Label every asset as resolved, compatibility alias, or unresolved.

## Common failure signatures

- LoRA/checkpoint selector path fails `value_not_in_list`
- missing `LoadImage` input blocks smoke
- nested custom-node repo ignored by parent git repo
- alias silently described as original asset

## Evidence standard

Retain asset ledger, source mapping, custom-node commit list, install logs.

## Hard stops

Stop if a critical source-identical asset is missing and no approved alias/fallback exists.

## Output schema

`asset_name`, `requested_name`, `resolved_path`, `source`, `state`, `staged_path`, `custom_node_repo`, `commit`, `install_status`, `gap`.
