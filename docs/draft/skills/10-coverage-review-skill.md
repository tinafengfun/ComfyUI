# Coverage review skill

## Use when

Use before publication or after any major validation pass.

## Inputs

- workflow JSON
- authoritative API prompt
- full-run evidence
- branch-smoke evidence
- gap reports

## Algorithm

1. Enumerate workflow nodes.
2. Enumerate prompt nodes.
3. Extract executed nodes from full-run evidence.
4. Extract executed nodes from smoke evidence.
5. Exclude structural nodes from runtime-gap claims.
6. Classify every executable node.

## Common failure signatures

- prompt misses workflow nodes
- intended outputs pruned during validation
- one successful branch used as whole-workflow proof
- blocked node not represented in support statement

## Evidence standard

Retain coverage table with evidence source per node.

## Hard stops

Stop release if executable nodes are uncovered and not explicitly classified.

## Output schema

`node_id`, `node_type`, `structural`, `prompt_present`, `full_run`, `smoke_run`, `status`, `evidence`, `gap`.
