# Delivery packaging prompt

## Task

Package the migration result for engineering review and customer-facing validation.

## Required context

- final support statement
- patch files
- deployment steps
- validation prompts/histories/logs
- generated outputs
- asset ledger and gap reports

## Constraints

1. Claims must match evidence.
2. Do not hide CPU fallback, smoke-only aliases, or unresolved assets.
3. Customer delivery must include manual validation steps where GUI validation is required.
4. Keep artifact bundles as evidence, not duplicate generic docs.

## Steps

1. Package code patches and patch README.
2. Write deployment and fresh-environment checklist.
3. Include workflow copies, prompts, histories, logs, telemetry, and generated outputs.
4. Write acceptance criteria and manual GUI validation steps.
5. Summarize known gaps and escalation paths.
6. Fill or adapt `docs/draft/templates/migration-result-report-template.md`.
7. Link reusable docs and case evidence.

## Output

Create a delivery bundle with:

- patch inventory
- deployment guide
- asset/custom-node ledger
- validation report
- customer manual test plan
- known gaps and support matrix
- artifact index
- final migration result report

## Hard stops

Stop delivery if the package cannot reproduce the claimed result or if customer-facing validation evidence is missing.

## Prior-migration lessons

Dasiwa delivery improved only after it became end-user oriented: workflow copies, GUI validation, generated outputs, manual steps, and fresh deployment checklist all mattered.
