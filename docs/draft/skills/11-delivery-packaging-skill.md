# Delivery packaging skill

## Use when

Use after migration, validation, and review evidence are available.

## Inputs

- final support statement
- patch diff or patch bundle
- deployment baseline
- validation artifacts
- asset ledger
- known gaps

## Algorithm

1. Package patches and record upstream commits.
2. Write fresh deployment checklist.
3. Include workflow copies, prompts, histories, logs, telemetry, and outputs.
4. Add manual GUI/customer validation steps when relevant.
5. State acceptance criteria and known limitations.
6. Fill or adapt the migration result report template.
7. Link artifact bundle and canonical docs.

## Common failure signatures

- delivery doc says full success but evidence is smoke-only
- generated media missing from artifact bundle
- patch application steps not reproducible
- customer GUI validation omitted
- result report lacks branch coverage or hard-stop evidence

## Evidence standard

Retain patch bundle, deployment guide, validation report, outputs, and artifact index.

## Hard stops

Stop delivery if reproduction steps or evidence do not support the support statement.

## Output schema

`patches`, `deployment`, `validation`, `outputs`, `asset_state`, `support_matrix`, `known_gaps`, `acceptance_steps`.
