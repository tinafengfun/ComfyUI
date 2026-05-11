# Prompt conversion validation prompt

## Task

Convert the workflow JSON into an API prompt and prove the prompt validates correctly before runtime interpretation.

## Required context

- workflow JSON
- workflow inventory
- asset ledger
- running ComfyUI endpoint
- converter tool, if available

## Constraints

1. Preserve widget-only nodes and required literal values.
2. Normalize selector-backed asset names to submit-safe basenames.
3. Capture raw `/prompt` response.
4. Do not trust `execution_success` without `node_errors` and output-node checks.

## Steps

1. Convert workflow JSON to API prompt.
2. Preserve widget-heavy nodes such as literal inputs, prompt editors, lineup nodes, LoRA loaders, and package-specific controls.
3. Normalize model and asset selectors.
4. Submit to `/prompt`.
5. Inspect `node_errors`, validated output nodes, and pruned branches.
6. Fix exporter or input issues before runtime.

## Output

Create a prompt-validation package with:

- converted prompt JSON
- raw validation response
- node_errors summary
- intended output-node status
- fixes applied or remaining blockers

## Hard stops

Stop if intended output nodes are pruned, required inputs are missing, or validation errors remain on the critical path.

## Prior-migration lessons

Dasiwa showed that `execution_success` can be misleading when the intended output node never ran. Widget-only/literal nodes and selector-backed names were recurring prompt-export hazards.
