# Coverage review prompt

## Task

Audit whether the migration evidence covers every executable workflow node.

## Required context

- original workflow JSON
- authoritative converted full prompt
- full-run history/logs
- successful branch-smoke histories/logs
- generated outputs
- known gap reports

## Constraints

1. Count structural nodes but exclude them from runtime-gap claims.
2. Do not let a full run hide pruned branches.
3. Do not claim all nodes are covered unless every executable node has evidence or an explicit gap.
4. Keep smoke evidence separate from full-run evidence.

## Steps

1. Extract workflow JSON node set.
2. Extract converted prompt node set.
3. Extract executed nodes from full-run evidence.
4. Extract executed nodes from successful branch-smoke evidence.
5. Build coverage table by node.
6. Classify each missing node as structural, pruned, untested, covered by smoke, CPU fallback, or blocked.

## Output

Create a coverage-review report with:

- node coverage table
- uncovered executable nodes
- evidence source per covered node
- final support statement
- required follow-up tests or gap notes

## Hard stops

Stop publication if executable nodes are neither covered by evidence nor explicitly classified as gaps.

## Prior-migration lessons

Dasiwa showed that all-executable-node coverage may require full-run plus branch-smoke evidence. A single run does not necessarily cover every branch.
