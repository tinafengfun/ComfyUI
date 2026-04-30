# Intel XPU workflow release standard

Use this document when turning a one-off migration effort into a publishable package under `docs/` plus `patches/`.

The goal is to make future workflow migrations faster to review, reproduce, and extend.

## Release goals

A release package should let the next engineer answer all of these without reverse-engineering the whole repo history:

1. What workflow and hardware target were validated?
2. What code changed?
3. Which tests actually ran?
4. Which assets were publicly resolved, locally staged, or smoke-only aliases?
5. How do I deploy and reproduce the run?
6. Which outputs succeeded, which failed, and why?

## Required package contents

Every published migration package should include the following categories.

| Category | Required contents |
| --- | --- |
| **Code patches** | ComfyUI core patch artifacts, custom-node patch artifacts, and a short patch index |
| **Tests** | unit test command(s), branch smoke command(s), full-size probe command(s), and exact logs |
| **Deployment** | environment/bootstrap steps, model-path config, server start command, and health-check method |
| **Assets** | model search/staging method, shared-root assumptions, compatibility aliases, workflow-side `LoadImage` files |
| **Reports** | workflow analysis, memory analysis, XPU gap/support notes, complete test report, subjective output review |
| **Outputs** | generated png/mp4 outputs or an explicit statement that media was intentionally excluded |

## Recommended on-disk layout

Use a stable package layout so different migrations look the same:

```text
docs/
  intel-xpu-workflow-release-standard.md
  artifacts/
    <workflow-case>/
      logs/
      prompts/
      telemetry/
      generated/
      tests/
      reports/         # optional if you want sub-grouping
patches/
  <workflow-case>/
    README.md
    ComfyUI-*.patch
    <custom-node>.patch
```

Notes:

- Keep **code patches** in `patches/`, not buried inside `docs/artifacts/`.
- Keep **runtime evidence** in `docs/artifacts/<case>/`.
- If the environment is remote, sync back the exact logs/prompts/media that justify the claims before publishing.

## Publication workflow

### 1. Freeze the scope

Record:

- workflow filename
- hardware target
- effective VRAM budget
- server flags
- whether the package proves smoke success, full-size success, or only a blocked-case diagnosis

### 2. Freeze the code deltas

Before publishing:

1. collect every uncommitted code change that mattered
2. regenerate patch artifacts
3. update the patch README so a reviewer can tell what each patch is for

Code changes that only live in runtime history are not enough.

## 3. Freeze validation evidence

For every claimed success or failure, preserve:

- exact command
- prompt file
- `/prompt` validation result when relevant
- node-level log or history
- generated file path or explicit absence

Minimum validation set:

1. unit tests for tooling changes
2. branch smoke runs
3. full-size probe or blocked-case evidence

## 4. Freeze asset provenance

Every referenced model or non-model asset should be labeled as one of:

| State | Meaning |
| --- | --- |
| **resolved and staged** | found and staged under a known root |
| **shared-root resolved** | available from a read-only shared model root exposed via `extra_model_paths.yaml` |
| **smoke-only compatibility alias** | enough for prompt validation or smoke execution, but not proof of source-identical fidelity |
| **unresolved proprietary source** | original source/name still not recovered |

Also record:

- if the shared model root was read-only
- which assets had to remain inside the isolated checkout
- which `LoadImage` files were required for workflow execution

## 5. Required release checks

Do not publish until these are true:

1. prompt conversion has been checked for widget-only and selector-backed inputs
2. `/prompt` `node_errors` have been reviewed for the published prompt files
3. target output nodes were confirmed to execute, not merely omitted from the validated output set
4. generated png/mp4 files exist for every claimed media-producing success
5. the patch bundle matches the actual code changes in the repo

## 5.1 Required workflow enable summary

Every customer-facing workflow delivery should explicitly summarize the workflow's **enable-related execution state**.

Minimum expectations:

1. summarize whether the source workflow contains any bypassed or disabled nodes
2. summarize the source values for any workflow-level enable/safety toggles that matter to execution
3. summarize the **effective validation prompt values** when they differ from the source workflow
4. state why each override exists and whether the workflow JSON itself stayed unchanged

Typical examples:

- `sage_attention: auto -> disabled`
- `enable_fp16_accumulation: True -> False`
- any workflow runner policy that keeps the graph intact but applies Intel-safe overrides at prompt-conversion time

Do not publish a workflow handoff that only says “tested successfully” without naming the enable/override state that actually produced the result.

Generated example:

- `docs/artifacts/dasiwa-delivery/dasiwa-wan22-delivery.md`

## 6. Dasiwa lessons that are now general rules

These were specific bugs during this migration, but they generalize:

1. **Selector-backed names must be basename-normalized.**  
   `Wan/...` or Windows-style exported names can silently invalidate a branch at `/prompt` time.
2. **`execution_success` is not enough.**  
   A branch can report success while the intended output node was pruned by validation fallout.
3. **Shared roots may be read-only.**  
   Treat `extra_model_paths.yaml` plus isolated local assets as a first-class deployment pattern.
4. **Remote evidence must be synced back.**  
   If the real run happened on a remote box, the local release package still needs the logs, prompts, and outputs.

## 7. Release checklist

Use this before `git add`:

```text
□ workflow and hardware target are stated plainly
□ code patches are regenerated and indexed
□ unit tests for tooling changes are included
□ branch smoke commands and logs are included
□ full-size probe or blocked-case evidence is included
□ deployment steps and model-path config are included
□ model search/staging method is documented
□ compatibility aliases are labeled clearly
□ generated outputs are present or intentionally excluded
□ docs/README points reviewers to this package
```

## 8. Git publication expectations

When publishing:

1. stage the updated reusable docs
2. stage the workflow-specific artifacts
3. stage the patch bundle
4. confirm `git status` only contains intended release files
5. commit with a message that names the workflow case clearly

The resulting commit should read like a releasable handoff, not a scratchpad dump.
