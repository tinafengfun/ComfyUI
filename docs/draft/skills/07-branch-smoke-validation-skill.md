# Branch smoke validation skill

## Use when

Use after prompt validation and before full-size execution.

## Inputs

- validated prompt
- branch map
- target output node
- reduced-resource settings

## Algorithm

1. Choose the smallest faithful branch.
2. Keep graph structure intact while reducing size, steps, or frames only where allowed.
3. Run with fixed seed.
4. Verify intended output files and media integrity.
5. Inspect the history for both executed and cached nodes.
6. If execution fails after upstream critical compute completed, classify the failure at the failing node instead of discarding upstream evidence. A missing declared Python package in a target custom node is an environment dependency gap, not a graph success and not a reason to bypass the node.
7. If a dependency fix is applied and the rerun passes mostly from cache, label the pass as cache-assisted and, when practical, run one safe cache-bust verification that preserves the graph and branch boundary.
8. Check boundary variants instead of assuming the "middle" case covers all cases.
9. Record runtime, placement, dependency fixes, cache behavior, and gaps.

## Common failure signatures

- branch succeeds only because a node was bypassed
- output file missing despite success event
- compatibility alias treated as fidelity proof
- smoke result generalized to all branches
- single-image branch used to claim double/triple-image support
- first/last-frame path used to claim all multi-reference variants
- frame count or resolution tail case silently untested
- downstream custom-node fails on a declared runtime dependency that was not installed during environment deployment
- rerun after fixing a late blocker succeeds only because upstream outputs were cached, but the report omits cached-node evidence

## Evidence standard

Retain branch prompt, history, logs, outputs, telemetry, and visual/media checks.

For each branch family, record:

- tested branch variant
- reduced settings and why they are faithful
- executed nodes and cached nodes
- output file evidence
- dependency gaps and fixes found during smoke
- cache-bust verification, if cache affected the final evidence
- untested variants
- whether the result is API-only, GUI-imported, or GUI-manually validated

Use a consistent artifact set per branch:

```text
07-{branch_slug}-smoke-prompt.json
07-{branch_slug}-smoke-notes.json
07-{branch_slug}-smoke-request.json
07-{branch_slug}-smoke-submit-response.json
07-{branch_slug}-smoke-history.json
07-{branch_slug}-smoke-summary.json
07-{branch_slug}-smoke-evidence.json
07-{branch_slug}-smoke-before.json
07-{branch_slug}-smoke-after.json
07-{branch_slug}-smoke.md
```

If there are failed attempts, preserve them with an attempt suffix instead of overwriting:

```text
07-{branch_slug}-smoke-attempt1-history.json
07-{branch_slug}-smoke-attempt1-failure-summary.json
```

## Hard stops

Stop full validation if a critical branch cannot smoke successfully.

## Output schema

`branch`, `output_node`, `variant`, `settings`, `history`, `outputs`, `executed_nodes`, `cached_nodes`, `placement`, `validation_path`, `dependency_fixes`, `cache_bust_verification`, `status`, `untested_variants`, `gap`.

## Completion rule

Step 7 is complete only when every critical output branch is either:

1. branch-smoke passed with output evidence
2. explicitly blocked with failing node, error, and preserved artifacts
3. explicitly out of scope with human-approved rationale

Do not proceed to Step 8 from only one successful branch if the topology has other critical branches.
