# Prompt conversion validation skill

## Use when

Use before any runtime result is interpreted.

## Inputs

- workflow JSON
- asset ledger
- running ComfyUI endpoint
- converter script or manual conversion process

## Algorithm

1. Convert graph to API prompt while preserving real inputs.
2. Keep literal/widget-only nodes and package-specific controls.
3. Normalize selector-backed names to basenames.
4. Initialize custom nodes through the same startup path as ComfyUI when validating offline; route-dependent custom nodes may require `PromptServer.instance`.
5. Validate without queueing execution when the task is validation-only. Use internal `execution.validate_prompt()` or an equivalent no-queue path; use `/prompt` only when execution is intentionally allowed.
6. Inspect `node_errors`, output set, and pruned nodes.
7. Separate exporter fixes from workflow semantic changes. Correct widget-order or selector serialization bugs, but do not silently rewrite runtime policy values such as `cuda:0`, presets, seeds, dtype, or resolution.
8. If the prompt now fails only on target runtime-policy or current-schema values, create an explicit validation variant as a Step 6 sub-pass:
   - derive it from the converted prompt, not from an edited source workflow
   - use a stable suffix such as `06b-runtime-policy-*`
   - change only the inputs required by `object_info` or the documented target runtime policy
   - write a change-note artifact with node ID, class, input name, old value, new value, and reason
   - rerun no-queue validation and compare intended outputs
9. Fix conversion before execution.

## Common failure signatures

- `Int`, prompt editor, lineup, or loader widget value dropped
- selector value not in list
- `execution_success` returned while intended output never runs
- output node pruned by upstream validation error
- `/prompt` queues execution after successful validation
- direct custom-node initialization fails because `PromptServer.instance` is absent
- widget-order drift maps a historical widget into the wrong current input
- current custom-node schema rejects old workflow widget values such as preset labels or seed ranges
- runtime exposes only `xpu:0` while the preserved workflow prompt still requests `cuda:0`
- source-preserving prompt fails validation, but an explicit runtime-policy variant validates with the same nodes and intended outputs

## Evidence standard

Retain converted prompt, raw validation response, validation method, queue/execution status, `node_errors`, and output-node comparison.

For a runtime-policy validation variant, also retain the variant prompt, change-note artifact, proof that the source workflow was not modified, and a diff/summary proving only expected inputs changed.

## Hard stops

Stop if critical validation errors remain, intended outputs are missing, or the only available fix would silently alter workflow semantics.

Do not continue to branch smoke from a silent or undocumented policy rewrite. Continue only from either the source-preserving prompt or a clearly labeled runtime-policy variant with empty `node_errors`.

## Output schema

`prompt_path`, `validation_method`, `queued_execution`, `validation_response`, `node_errors`, `validated_outputs`, `missing_inputs`, `pruned_outputs`, `fixes`, `semantic_change_required`, `variant_path`, `variant_changes`, `source_workflow_modified`, `nodes_bypassed`.
