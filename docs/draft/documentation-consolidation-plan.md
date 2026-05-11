# Documentation consolidation plan

## 1. Goal

Reduce the reviewer burden in `docs/` without losing evidence.

The target end state should be:

1. reusable docs explain **method**
2. workflow-specific docs explain **one case**
3. package-specific docs explain **one repository/package**
4. artifact bundles keep **raw evidence**
5. annexes exist only for compatibility or deep audit trails

## 2. Current state

The repo is already much cleaner than before, but the review burden is still high because:

1. Dasiwa evidence is distributed across multiple case docs and artifact annexes
2. some reusable docs still carry too much case-specific memory
3. some legacy docs remain as compatibility shims
4. there is still no single short review memo for humans

## 3. Proposed target structure

### 3.1 Reusable workflow method

Keep as canonical:

1. `intel-xpu-workflow-migration-prompt.md`
2. `intel-xpu-workflow-migration-skill.md`
3. `migration_checklist.md`
4. `intel-xpu-workflow-review-prompt.md`
5. `intel-xpu-workflow-release-standard.md`
6. `intel-xpu-workflow-deployment.md`
7. `intel-xpu-workflow-tuning-prompt.md`
8. `intel-xpu-workflow-tuning-skill.md`
9. `intel-xpu-optimization-research.md`

### 3.2 Workflow case docs

Keep as canonical Dasiwa case docs:

1. `workflow_analyse.md`
2. `dasiwa-b60-migration-plan.md`
3. `dasiwa-b60-xpu-support-matrix.md`
4. `dasiwa-b60-fullsize-oom-report.md`
5. `artifacts/dasiwa-delivery/dasiwa-wan22-delivery.md`

Demote to annex-only:

1. `dasiwa-b60-e2e-test-plan.md`
2. phase annex docs under `artifacts/dasiwa-delivery/phase-*`

### 3.3 Package case docs

Keep as canonical:

1. `mixlab-xpu-source-audit.md`
2. `mixlab-xpu-support-matrix.md`
3. `mixlab-xpu-execution-plan.md`
4. `mixlab-xpu-gap-summary.md`
5. `wan-xpu-source-audit.md`
6. `wan-xpu-support-matrix.md`

### 3.4 Legacy / compatibility docs

Keep as thin pointers only:

1. `memory_checklist.md`

Potential future candidates for further demotion if review agrees:

1. older reproduction notes that are no longer first entrypoints

## 4. Proposed review-driven cleanup sequence

### Pass 1: approve document roles

Human review should first confirm that every file in `docs/` belongs to one of these roles:

1. reusable method
2. workflow case
3. package case
4. artifact evidence
5. legacy pointer

This is the highest-value review pass because it prevents future drift.

### Pass 2: reduce repetitive prose across reusable docs

Main overlap to reduce later:

1. migration prompt vs migration skill
2. migration skill vs migration checklist
3. deployment conventions vs full repro guide
4. release standard vs node delivery standard

The goal is not to over-merge, but to avoid repeating the same rules in four places.

### Pass 3: create one short executive summary

Recommended future file:

- `docs/intel-xpu-migration-executive-guide.md`

Purpose:

1. one short entrypoint for human reviewers
2. explain the overall process
3. point to the deeper prompt/skill/checklist/release docs
4. point to Dasiwa as the canonical workflow case
5. point to Mixlab and Wan as canonical package cases

### Pass 4: keep artifacts evidence-heavy, not prose-heavy

Artifact bundles should keep:

1. logs
2. prompts
3. telemetry
4. histories
5. review-ready delivery note

They should avoid growing too many parallel “mini guides” that restate generic migration policy.

## 5. Specific file actions recommended after review

### Safe to keep as-is after this draft round

1. `migration_checklist.md`
2. `intel-xpu-workflow-deployment.md`
3. `mixlab-xpu-gap-summary.md`
4. `memory_checklist.md` as a pointer

### Good candidates for a future tightening pass

1. `intel-xpu-workflow-migration-skill.md`
   - trim repeated Dasiwa-shaped detail once a shorter executive guide exists
2. `intel-xpu-workflow-full-repro-guide.md`
   - keep as a case repro guide, but ensure it never reads like a generic deployment standard
3. `dasiwa-b60-migration-plan.md`
   - optionally add a short “current final status” box at top for faster review
4. `workflow_analyse.md`
   - keep rich analysis, but consider adding a short reviewer summary section at the top

## 6. Deliverable recommendation

After human review of this draft bundle, the cleanest next deliverable would be:

1. accept the current generic/workflow/package/annex split
2. make one additional pass to create an executive guide
3. leave evidence-heavy artifact bundles intact
4. avoid another large renaming pass unless the reviewer wants stronger case naming conventions
