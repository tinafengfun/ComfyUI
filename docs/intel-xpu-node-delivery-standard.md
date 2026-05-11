# Intel XPU custom-node delivery standard

Use this document when turning a one-off custom-node migration into a publishable package under `docs/` plus `patches/`.

This is the package-level companion to `docs/intel-xpu-workflow-release-standard.md`. That document is for workflow releases; this one is for custom-node repositories and custom-node subpackages.

The goal is to make future Intel XPU node migrations faster to review, reproduce, publish, and extend without re-discovering repo state by hand.

## Release goals

A node delivery package should let the next engineer answer all of these without reverse-engineering the repo history:

1. Which upstream repository, ref, and commit were migrated?
2. Which node families or packages are in scope?
3. What works on Intel XPU, what is CPU fallback only, and what is blocked?
4. Which patches are required to reproduce the result?
5. Which models, external services, or system packages are required?
6. Which tests actually ran and where is the evidence bundle?
7. How do I install, deploy, and reproduce the package on a clean machine?
8. How would an end user verify the delivered behavior from the real UI or runtime entrypoint, not just from engineer-only scripts?

## Required package contents

Every published node migration package should include the following categories.

| Category | Required contents |
| --- | --- |
| **Provenance** | upstream repo URL, branch or tag, exact upstream commit, migration base commit, and any fork or mirror used during delivery |
| **Inventory** | package summary, node family list, exposed nodes, Python/JS/native dependency summary, and any optional extras intentionally excluded |
| **Support matrix** | per-family or per-feature status table with `validated`, `smoke-only`, `cpu-fallback`, `blocked`, or `not-assessed` labels |
| **Code patches** | patch bundle, patch index, and a short note for each patch describing why it exists |
| **Runtime requirements** | required models, service endpoints, API keys handled out of band, system packages, and environment variables |
| **Validation** | install command, unit test command(s), smoke workflow command(s), blocked-case evidence, and exact logs |
| **Deployment** | bootstrap steps, frontend build notes if any, server start notes, model-path assumptions, and packaging or wheel guidance if relevant |
| **End-user validation** | validation-ready workflow/config copies if needed, GUI or service access path, manual verification steps, and expected outputs or observables |

## Recommended on-disk layout

Use a stable package layout so different node migrations look the same:

```text
docs/
  intel-xpu-node-delivery-standard.md
  artifacts/
    <node-case>/
      logs/
      prompts/
      telemetry/
      tests/
      reports/
patches/
  <node-case>/
    README.md
    0001-*.patch
    0002-*.patch
```

Notes:

- Keep reusable guidance in `docs/`.
- Keep migration-specific evidence in `docs/artifacts/<node-case>/`.
- Keep all code deltas in `patches/<node-case>/`, not mixed into the artifact bundle.

## 1. Freeze upstream provenance

Before publishing, record the exact source lineage:

- canonical upstream repository URL
- upstream branch, tag, or release name
- exact upstream commit SHA used as migration input
- if the delivery repo is a fork, the fork URL and fork commit SHA
- if the node lives inside a monorepo, the package or subdirectory path
- any local carry patches that were already present before Intel XPU work started

If you cannot name the exact upstream commit, the package is not ready to publish.

## 2. Freeze the package inventory summary

Summarize what the package actually ships and what the migration touched.

Minimum inventory:

1. repository or package name
2. short package purpose statement
3. list of exported node families or node groups
4. Python dependencies, especially device/runtime-sensitive ones
5. frontend or web assets that must be rebuilt
6. native extensions, custom ops, or binary wheels
7. required models or non-model assets
8. required external services, if any

Call out anything intentionally left out of scope, such as optional integrations, training utilities, or unsupported extras.

## 3. Support matrix expectations

Every package should include a support matrix that is specific enough to be actionable.

Recommended columns:

| Family / feature | Status | Evidence | Notes |
| --- | --- | --- | --- |

Status expectations:

- **validated**: executed on Intel XPU with retained evidence
- **smoke-only**: basic import or narrow-path execution succeeded, but not enough to claim full feature parity
- **cpu-fallback**: package works only because this path is explicitly forced to CPU
- **blocked**: known failure on Intel XPU with captured repro evidence
- **not-assessed**: not tested yet; do not imply support

Support matrices should be grouped by node family, backend, or major feature area instead of a single blanket package status.

## 4. Patch bundle structure

The patch bundle should make it obvious how to replay the migration.

Expected contents in `patches/<node-case>/README.md`:

1. upstream repo and commit baseline
2. patch application order
3. short purpose of each patch
4. whether a patch is Intel XPU enablement, compatibility glue, test fix, or packaging-only work
5. whether any patch is expected to stay out of upstream

General rules:

- prefer small ordered patches over one opaque dump
- regenerate patches from the final repo state before publishing
- do not rely on uncommitted local diffs as the only record of migration work

## 5. Required models and external services

Node packages often depend on more than Python imports. Record all required runtime dependencies plainly.

For each required model or service, state:

- name and purpose
- whether it is required for import, smoke test, or full execution
- where it is expected to live
- whether it was actually staged during validation
- whether a public substitute or smoke-only alias was used

For external services, also record:

- endpoint type or local daemon name
- authentication method without exposing secrets
- minimum version if relevant
- degraded behavior when the service is absent

## 6. CPU fallback declarations

CPU fallback is allowed only when it is named explicitly.

If any feature is not truly running on Intel XPU, document:

1. the exact node family or operation forced to CPU
2. whether fallback is automatic, manual, or environment-variable controlled
3. the performance or fidelity impact
4. whether the package still provides user value in this mode

Do not collapse CPU fallback into general Intel XPU support claims.

## 7. Blocked families and excluded scope

Blocked families must be called out directly instead of disappearing from the release text.

For each blocked family, record:

- failure signature
- triggering command or minimal repro
- missing kernel, unsupported dependency, precision issue, or service gap
- whether the block is hard, partial, or believed fixable
- link to the retained log or traceback artifact

Also list families that were intentionally excluded from the release scope so readers do not mistake silence for support.

## 8. Required test artifact bundle

For every published claim, preserve the artifact bundle needed to replay or audit it.

Minimum validation set:

1. package import or registration check
2. unit tests for changed utilities, wrappers, or adapters
3. smoke workflow or node execution command(s)
4. frontend build or asset validation logs if the package ships JS/UI changes
5. blocked-case logs for anything labeled `blocked`

Each artifact set should preserve:

- exact command
- environment variables that mattered
- model or service assumptions
- raw stdout/stderr log
- produced output path, if any

### 8.1 Validation-ready copies

Engineer-only overrides are not enough when the package is meant to be consumed through ComfyUI UI flows, API payloads, or another human-facing entrypoint.

If the original workflow, config, or package defaults are not directly validation-friendly, publish a clearly labeled validation copy.

Examples:

- a workflow JSON with Intel-safe execution toggles already baked in
- a smoke-scale workflow/config copy that reduces dimensions, steps, or frame counts for acceptance testing
- a service config that points at a dedicated validation endpoint instead of a production/shared one

Rules:

1. keep the original source artifact for audit
2. keep the validation copy separate and clearly named
3. document exactly which values changed and why
4. do not hide validation-only changes inside prose without shipping the artifact itself

### 8.2 Evidence-first publishing when media is excluded

Generated images, audio, or video may be too large, sensitive, or unnecessary to publish with every delivery.

If media outputs are excluded from git, the package should still publish enough non-media evidence to review the result:

1. exact prompt/config/workflow used
2. raw logs
3. history or metadata JSON showing the executed outputs
4. output paths and filenames
5. any screenshots or lightweight previews if policy allows

Do not collapse "media excluded" into "evidence missing".

## 9. Installation and reproduction steps

A reviewer should be able to rebuild the environment from the delivery package.

Document:

1. repository checkout command and exact commit
2. Python environment expectations
3. dependency install command
4. frontend build command, if any
5. patch apply command or ordered patch replay steps
6. model and asset placement expectations
7. service startup steps, if required
8. exact reproduction command used for validation

If the package depends on a shared read-only model root or a site-local service, say so plainly.

## 10. Deployment notes

Deployment guidance should explain the runtime shape, not just local repro.

Capture:

- whether the package is expected to run inside a stock ComfyUI checkout, a pinned image, or a managed deployment
- any `extra_model_paths.yaml` assumptions
- environment variables or launch flags that must be set
- whether remote workers, compiled extensions, or prebuilt wheels are required
- whether the package was validated on a single card, multi-card host, or shared server

If deployment differs from local validation, explain the delta.

### 10.1 Dedicated validation instance guidance

If the package is validated on a shared or long-lived host, prefer a dedicated validation instance instead of reusing an unknown existing server.

Record:

1. host and port
2. whether the instance was localhost-only, LAN-accessible, or tunnel-only
3. whether a dedicated database file, cache directory, or output directory was used
4. whether the instance coexisted with another ComfyUI process on the same machine

Why:

- shared instances may not have the required custom nodes loaded
- existing instances may have stale package state
- database locks and output-directory collisions make reproduction ambiguous

### 10.2 End-user manual verification path

If the package is meant to be used through a GUI or user-facing runtime, document the exact manual verification flow.

Minimum expectations:

1. where the end user connects
2. which workflow/config file they load
3. which widget or setting values they should inspect
4. which action they trigger (`Queue Prompt`, service request, UI action, etc.)
5. which outputs or state changes prove success

This should be written for a reviewer or customer, not only for the original migration engineer.

## 11. Anti-overclaim language

Publish with language that matches the evidence.

Allowed claim patterns:

- `Validated on Intel XPU for <family> under <environment>.`
- `Smoke-tested on Intel XPU; full feature parity not yet claimed.`
- `<family> currently requires explicit CPU fallback.`
- `<family> is blocked on Intel XPU due to <short reason>.`

Avoid these patterns unless the evidence truly supports them:

- `Fully supported on Intel XPU`
- `Works on Intel GPUs` without scope qualifiers
- `Drop-in replacement` when blocked or fallback paths remain
- `Production ready` without deployment evidence and retained logs

If only one family or path was tested, name that family or path directly instead of implying package-wide support.

## 12. Release checklist

Use this before `git add`:

```text
□ upstream repo URL, ref, and commit are recorded
□ package inventory summary is included
□ support matrix covers validated, blocked, fallback, and unassessed areas honestly
□ patch bundle is regenerated and ordered
□ required models and services are listed
□ CPU fallback areas are declared explicitly
□ blocked families include repro evidence
□ test artifact bundle is present
□ validation-ready workflow/config copies are included when the original defaults are not reviewer-friendly
□ installation and reproduction steps are complete
□ deployment notes match the validated environment
□ end-user manual verification steps are documented when the package is GUI- or service-facing
□ dedicated validation instance details are recorded if a shared host was used
□ non-media evidence remains sufficient even if generated media is not published
□ release text avoids package-wide overclaims
```

## 13. Git publication expectations

When publishing:

1. stage the reusable doc updates if needed
2. stage the migration-specific artifacts
3. stage the patch bundle
4. confirm `git status` only contains intended release files
5. commit with a message that names the node package or migration case clearly

The resulting commit should read like a reproducible delivery handoff, not a partial lab notebook.

## 14. Process reflection

Recent delivery work showed that a technically correct migration package can still be weak as a customer handoff if it stops at engineer-facing smoke evidence.

The stronger default is:

1. **ship the original artifact and a validation-ready copy**
   - reviewers need both auditability and a low-friction way to test
2. **prefer a dedicated validation instance on shared hosts**
   - this avoids stale node state, database locking, and ambiguous server ownership
3. **prove a near end-to-end path, not only isolated smokes**
   - branch or family smokes are useful, but a final whole-scenario smoke gives reviewers much more confidence
4. **document the user-facing verification flow explicitly**
   - the package should tell a customer exactly what to open, click, and expect
5. **separate evidence policy from media policy**
   - excluding large media from git is acceptable
   - excluding the evidence that proves the result is not

Use this reflection as a bias when deciding whether a package is merely "internally reproducible" or actually "deliverable to another team or customer".
