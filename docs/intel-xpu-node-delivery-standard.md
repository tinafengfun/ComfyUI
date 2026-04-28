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
□ installation and reproduction steps are complete
□ deployment notes match the validated environment
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
