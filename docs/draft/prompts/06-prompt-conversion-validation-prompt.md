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
3. Capture the raw validation response. Use `/prompt` only when execution is intentionally allowed; a successful `/prompt` POST queues the prompt for execution.
4. Prefer validation-only mechanisms such as internal `execution.validate_prompt()` when the step must not run the workflow.
5. Do not trust `execution_success` without `node_errors` and output-node checks.
6. Record exporter/schema fixes separately from workflow semantic changes.
7. Treat an explicit runtime-policy validation variant as a Step 6 sub-pass, not as a source workflow edit or a new migration phase.

## Steps

1. Convert workflow JSON to API prompt.
2. Preserve widget-heavy nodes such as literal inputs, prompt editors, lineup nodes, LoRA loaders, and package-specific controls.
3. Normalize model and asset selectors.
4. Initialize custom nodes the same way the server does before offline validation; some custom nodes require `PromptServer.instance` even when no HTTP request is sent.
5. Validate without queueing execution when possible. If `/prompt` is used, state that execution is intentionally allowed and retain the raw response.
6. Inspect `node_errors`, validated output nodes, and pruned branches.
7. Fix exporter or input issues before runtime, but do not silently normalize workflow policy values such as `cuda:0` or schema-incompatible prompts.
8. If validation fails only because the preserved workflow contains runtime-policy or current-schema values that cannot validate in the target environment, create a clearly named validation variant instead of overwriting the source prompt:
   - write a variant prompt such as `06b-runtime-policy-prompt.json`
   - document each changed input, old value, new value, and reason
   - keep the original workflow JSON unchanged
   - preserve every node and connection; do not bypass nodes
   - run no-queue validation again
9. Proceed to branch smoke only after the original validation failure and the explicit variant validation result are both documented.

## Output

Create a prompt-validation package with:

- converted prompt JSON
- raw validation response
- validation method and whether execution was queued
- node_errors summary
- intended output-node status
- fixes applied or remaining blockers
- runtime-policy variant prompt and change notes, only if Step 6 needs an explicit policy/schema compatibility variant

## Hard stops

Stop if intended output nodes are pruned, required inputs are missing, validation errors remain on the critical path, or a fix would change workflow semantics without explicit approval.

If a runtime-policy variant is needed, stop before Step 7 until the variant validates with all intended output nodes present.

## Prior-migration lessons

Dasiwa showed that `execution_success` can be misleading when the intended output node never ran. Widget-only/literal nodes and selector-backed names were recurring prompt-export hazards.

Zimage showed that `/prompt` is not a validation-only endpoint: when a prompt validates, it is queued for execution. Zimage also showed that generic exporter widget-order drift can create false validation errors, while preserved workflow values such as `cuda:0`, an old QwenVL preset string, or an oversized seed are real workflow/runtime-policy blockers that must not be silently rewritten.

Zimage Step 6b showed the right boundary for this situation: a runtime-policy validation variant is not an original workflow step and not branch smoke. It is an explicit Step 6 sub-pass used to prove that documented schema/device policy changes make the API prompt structurally valid before any runtime execution.

## Example output shape

```text
Prompt validation: failed
node_errors: node 54 value_not_in_list for lora_name
Intended output node: 208
Output status: pruned because upstream validation failed
Validation method: execution.validate_prompt, no queued execution
Decision: fix selector basename normalization before runtime testing
Forbidden next step: do not run full validation from this prompt
```

Runtime-policy variant example:

```text
Prompt validation: passed after explicit runtime-policy variant
Variant prompt: 06b-runtime-policy-prompt.json
Changed inputs: node 30 device cuda:0 -> xpu:0; node 93 seed normalized to current schema range
Source workflow modified: no
Nodes bypassed: no
Queued execution: no
Allowed next step: Step 7 branch smoke, still not full validation
```
