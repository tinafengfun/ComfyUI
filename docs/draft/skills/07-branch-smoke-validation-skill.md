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
5. Record runtime, placement, and gaps.

## Common failure signatures

- branch succeeds only because a node was bypassed
- output file missing despite success event
- compatibility alias treated as fidelity proof
- smoke result generalized to all branches

## Evidence standard

Retain branch prompt, history, logs, outputs, telemetry, and visual/media checks.

## Hard stops

Stop full validation if a critical branch cannot smoke successfully.

## Output schema

`branch`, `output_node`, `settings`, `history`, `outputs`, `placement`, `status`, `gap`.
