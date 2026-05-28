# Intake and dependency-source preflight skill

## Use when

Use as logical Step 00 before asset acquisition, feasibility analysis, environment setup, or runtime validation.

This skill is deliberately static and bounded. It creates the first durable dependency/source map so Step 01 can do asset and custom-node resolution without relying on chat memory or repeated ad hoc searches.

## Inputs

- workflow JSON path
- artifact folder
- configured model roots such as `ComfyUI/models`, `/home/intel/hf_models`, `/tmp/hf_models`, shared disks, or workflow cache roots
- custom-node root such as `ComfyUI/custom_nodes`
- local source notes such as `model_repo`, workflow note nodes, embedded URLs, installed package metadata, node-manager maps, or operator notes
- expected target or fidelity, if already known

## Algorithm

1. Parse the workflow JSON without modifying it.
2. Count nodes and links, list output nodes, and extract node types.
3. Build an all-node scan coverage table from the source workflow. Include every node ID, node type, title/label, mode/status, group/subgraph context when present, inbound/outbound link counts, and whether widgets/properties/metadata were scanned.
4. Verify `source_node_count == scanned_node_count`. If not, stop and report the missing node IDs.
5. Extract model filenames, LoRA/VAE/CLIP/UNet/checkpoint selectors, input image/video filenames, and source hints from every node's widgets, properties, metadata, and notes.
6. Check only local filesystem roots that were explicitly provided. Use exact filename checks first; do not search provider APIs or probe remote URLs.
7. Check custom-node local evidence: installed package directories, local Git remotes, local extension maps, and local metadata already present on disk.
8. Classify each dependency as `staged`, `source known`, `source hinted for Step 01`, `source unknown`, `access blocked`, or `smoke-only alias candidate`.
9. Decide whether Step 01 can start automatically, whether human source context is required first, and whether Step 01 can be skipped.
10. Write only `00-intake-preflight.md`. For large workflows, also write `00-node-scan.csv`, but keep the scan count and missing-node summary in the Markdown report.

## Evidence standard

The Step 00 report must preserve enough evidence for a new Step 01 session to continue without chat history:

- workflow path and artifact folder
- model roots and custom-node roots checked
- source-note files or workflow note nodes parsed, with credentials redacted
- node/link/output counts
- source node count, scanned node count, missing node IDs, and all-node scan coverage
- exact requested dependency names, expected folders, and local/source state
- hard stops and human inputs needed
- explicit next step

Record source hints as hints. Do not convert a HuggingFace/Civitai/GitHub/SSH URL into "reachable" unless a later Step 01 search/acquisition actually verifies it.

## Hard stops

Stop Step 00 and ask for human context only when Step 01 cannot even start safely:

- the source workflow file is unreadable or malformed
- no artifact folder is available
- a critical private source is referenced but no approved credential/source channel is available
- continuing would require guessing model identity, replacing nodes, bypassing nodes, or changing workflow semantics
- the only available evidence contains secrets that cannot be safely redacted
- the workflow cannot be scanned node-for-node from the source JSON

## Completion criteria

Step 00 is complete when `00-intake-preflight.md` exists and:

1. source node count equals scanned node count;
2. every source node is represented in the all-node scan table or linked `00-node-scan.csv`;
3. every visible dependency is named and classified;
4. every unknown, access-blocked, or source-hinted item has a Step 01 or human action;
5. the report says `can_start_step01` and `can_skip_step01_and_continue_to_feasibility`;
6. no remote/provider/SSH search, download, clone, install, runtime validation, workflow edit, or node bypass occurred;
7. no secrets are written to artifacts.

The step may complete with dependency gaps. Gaps become Step 01 work items; they are not a reason to run unbounded search inside Step 00. It may not complete with node-scan gaps.

## Output schema

`workflow`, `artifact_folder`, `model_roots_checked`, `model_source_notes`, `custom_node_roots_checked`, `custom_node_source_notes`, `credentials_handling`, `node_count`, `link_count`, `output_nodes`, `source_node_count`, `scanned_node_count`, `missing_node_ids`, `node_scan_coverage`, `required_models`, `required_input_media`, `required_custom_nodes`, `dependency_states`, `hard_stops`, `human_inputs_needed`, `can_start_step01`, `can_skip_step01_and_continue_to_feasibility`, `next_step`.
