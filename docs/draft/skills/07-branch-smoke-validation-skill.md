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
5. Check boundary variants instead of assuming the "middle" case covers all cases.
6. Record runtime, placement, and gaps.

## Common failure signatures

- branch succeeds only because a node was bypassed
- output file missing despite success event
- compatibility alias treated as fidelity proof
- smoke result generalized to all branches
- single-image branch used to claim double/triple-image support
- first/last-frame path used to claim all multi-reference variants
- frame count or resolution tail case silently untested

## Evidence standard

Retain branch prompt, history, logs, outputs, telemetry, and visual/media checks.

For each branch family, record:

- tested branch variant
- reduced settings and why they are faithful
- output file evidence
- untested variants
- whether the result is API-only, GUI-imported, or GUI-manually validated

## Hard stops

Stop full validation if a critical branch cannot smoke successfully.

## Output schema

`branch`, `output_node`, `variant`, `settings`, `history`, `outputs`, `placement`, `validation_path`, `status`, `untested_variants`, `gap`.
