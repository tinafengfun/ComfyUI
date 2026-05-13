# Intake and dependency-source preflight prompt

Use this prompt before feasibility analysis. Its purpose is to prove whether the workflow's dependency sources are known and reachable enough to route migration honestly.

This step does **not** install models, install custom nodes, modify workflow JSON, patch source code, or run ComfyUI.

## Task

Analyze the target ComfyUI workflow and produce an intake/dependency-source preflight report.

The report must answer:

1. Which model files, input media, and custom node types does the workflow require?
2. Which local, shared, remote, or public sources are available for those dependencies?
3. Which dependencies are source-known but not staged?
4. Which dependencies are still source-unknown or access-blocked?
5. Whether the migration can proceed to feasibility analysis, or must stop for human input first.

## Required context

- workflow JSON path
- planned artifact folder
- model roots to check, such as `ComfyUI/models`, `/home/intel/hf_models`, `/tmp/hf_models`, or shared model disks
- source notes such as `model_repo`, workflow notes, model-link notes embedded in the workflow, or private handoff notes
- custom-node roots to check, usually `ComfyUI/custom_nodes`
- custom-node source notes, such as installed package list, Git repos, node-manager extension map, workflow author notes, or public search hints
- expected migration target, if already known

## Constraints

1. Do not install models.
2. Do not install custom nodes.
3. Do not modify the workflow.
4. Do not bypass, delete, collapse, or replace nodes.
5. Do not run expensive validation jobs.
6. Do not write credentials, tokens, passwords, or private connection strings into artifacts.
7. Do not treat a similarly named model as source-identical unless the source, filename, size, and intended folder match or a human approves a smoke-only alias.
8. Do not continue silently when a critical custom-node source is unknown.

## Execution steps

1. Parse the workflow JSON.
   - Count nodes and links.
   - Extract every node type.
   - Extract model filenames, input media filenames, URLs, and repository notes from widgets and note nodes.
   - Identify output nodes and obvious critical-path node types.

2. Check model and input dependency sources.
   - Check each declared model root for exact filenames.
   - Check source notes such as `model_repo` for local, shared, remote, or public source locations.
   - If a remote/shared source is referenced, check whether it is reachable without recording credentials.
   - Record whether each file is staged, source-known but not staged, source-unknown, or access-blocked.

3. Check custom-node dependency sources.
   - Check whether each custom node type is registered or present in the current custom-node tree.
   - Check extension maps, package READMEs, source notes, or workflow notes for missing node types.
   - Record whether the source package is known, reachable but not installed, unknown, or access-blocked.

4. Identify hard stops before feasibility.
   - required source-identical model source is unknown
   - required input media is missing and has no known source
   - critical custom-node source is unknown
   - private repository or credentials are required and not provided through an approved channel
   - workflow dependency source changes the task from migration into asset acquisition or feature discovery

5. Produce `00-intake-preflight.md` in the planned artifact folder.

## Required output shape

```text
workflow:
artifact_folder:
model_roots_checked:
model_source_notes:
custom_node_roots_checked:
custom_node_source_notes:
remote_or_shared_sources_reachable:
credentials_handling:
node_count:
link_count:
output_nodes:
required_models:
required_input_media:
required_custom_nodes:
dependency_states:
hard_stops:
human_inputs_needed:
can_continue_to_feasibility:
next_step:
```

Use these dependency states:

```text
staged
source known
source reachable but not staged
source unknown
access blocked
smoke-only alias candidate
```

## Report tables

Include at least these tables.

### Model and input source table

| Requested asset | Workflow role | Expected folder | Local status | Source note / source path | State | Human action |
| --- | --- | --- | --- | --- | --- | --- |

### Custom-node source table

| Node type | Critical path? | Installed / registered evidence | Source package or repo | State | Human action |
| --- | --- | --- | --- | --- | --- |

### Preflight decision

| Decision item | Result |
| --- | --- |
| Can continue to feasibility? | yes / no / yes-with-gaps |
| Blocking model/input gaps | |
| Blocking custom-node gaps | |
| Credentials omitted from artifacts? | yes |
| Next artifact | `01-feasibility.md` or stop for human input |

## Hard stops

Stop before feasibility and ask for human direction when:

1. the model repository/source is unknown for a required source-identical model
2. the custom-node source is unknown for a critical output path
3. access to a private/shared dependency source is blocked
4. the workflow input image/video is missing and no source is known
5. continuing would require guessing model identity, replacing nodes, or changing workflow semantics

## Example command prompt

```text
根据 ComfyUI/docs/draft/prompts/00-intake-preflight-prompt.md，
对 <workflow.json> 做 dependency-source preflight。
模型源和 custom-node 源参考 <model_repo 或项目来源说明>。
输出只写到 <artifact_folder>/00-intake-preflight.md。
不要安装模型，不要安装 custom node，不要改 workflow，不要写凭据。
如果模型源或关键 custom-node 源未知，明确列为 hard stop。
```
