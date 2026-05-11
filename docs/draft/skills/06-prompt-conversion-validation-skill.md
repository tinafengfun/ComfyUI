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
4. Submit to `/prompt`.
5. Inspect `node_errors`, output set, and pruned nodes.
6. Fix conversion before execution.

## Common failure signatures

- `Int`, prompt editor, lineup, or loader widget value dropped
- selector value not in list
- `execution_success` returned while intended output never runs
- output node pruned by upstream validation error

## Evidence standard

Retain converted prompt, raw validation response, `node_errors`, and output-node comparison.

## Hard stops

Stop if critical validation errors remain or intended outputs are missing.

## Output schema

`prompt_path`, `validation_response`, `node_errors`, `validated_outputs`, `missing_inputs`, `fixes`.
