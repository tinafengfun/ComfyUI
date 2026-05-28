# Asset and custom-node resolution skill

## Use when

Use as logical Step 01 immediately after Step 00 intake/preflight to make dependencies explicit before feasibility analysis.

Use this as the owner of broad source search and acquisition. Step 00 only performs local/static intake and must defer URL, repository, SSH, provider, download, and clone work here.

Numbering note: this skill keeps the legacy `03-asset...` filename, but it is the **logical Step 01 asset/custom-node resolution skill**. `skills/01-feasibility-analysis-skill.md` is logical Step 02 and must not be used for asset preparation.

## Inputs

- workflow JSON
- model roots and caches
- custom-node directory
- approved download sources
- dependency-source preflight and any hard-stop list
- isolated workflow cache path, if acquisition is approved
- source context such as `model_repo`, `huggingface_mode.md`, SSH/shared-disk hints, local source roots, runtime-only provider tokens, and operator notes

## Algorithm

1. Read Step 00's all-node scan table or `00-node-scan.csv`. Verify source node count, scanned node count, and missing node IDs before acquisition.
2. For every source node, extract model and workflow-side asset references. If a node has no asset dependency, record `no asset dependency`; do not omit the row.
3. For each selected custom-node class, inspect wrapper source for implicit assets and runtime downloads: `from_pretrained()`, `hf_hub_download()`, `snapshot_download()`, `load_file()`, `torch.load()`, default `ckpt_name`, model-name dictionaries, and package cache/config paths. If wrapper source cannot be found, record `wrapper scan blocked` for each affected node/type.
4. Search local roots before remote sources, then try approved candidates in priority order. Prefer the reusable migration asset tool pool when available so provider search/download state is captured as compact JSON instead of long chat context:
   - existing workflow cache and configured model roots
   - exact SSH/shared-disk filename search
   - explicit HuggingFace file/repo URLs, `hf-mirror.com`, and `huggingface.co`
   - `www.civitai.com` and other approved model providers
   - GitHub repositories and `comfy.icu` for custom nodes
   - operator-provided exact source notes
5. Classify each dependency as `staged`, `source reachable but not staged`, `source unknown`, `access blocked`, `runtime-auto-download hidden asset`, or `smoke-only alias candidate`.
6. If the remaining hard stop is source-known but not staged, run a bounded acquisition pass: copy/download exact model files into an isolated workflow cache that mirrors both ComfyUI's model layout and the custom node's expected cache layout.
7. Clone source-known custom-node repositories into the isolated workflow cache and record commits.
8. Do not label a cloned custom-node repository as installed or registered until environment deployment and prompt validation prove it.
9. Verify file size and SHA-256 when provider metadata or source-side hashes are available.
10. Label every asset as resolved, compatibility alias, or unresolved.
11. If all candidates fail, document attempted providers, commands/source URLs with credentials redacted, failure reasons, and exact assets still required. Do NOT write gate keywords in artifacts — the system controls gating via `gate-signal.json`.

## Bounded execution and session output

Step 01 may run longer than Step 00, but it must not become an unbounded background search. For each local/SSH/provider/download subjob, record:

- provider or source root
- exact query or filename
- target path
- start/end state
- bytes transferred and checksum when available
- redacted command or API URL
- failure reason or human action required

If a subjob exceeds the configured timeout, stalls below the minimum transfer rate, needs credentials, or returns ambiguous candidates, stop that subjob and document the blocker factually. The system will create `gate-signal.json` if human intervention is needed. Do not keep the SDK session alive just to wait for uncertain external downloads.

## Common failure signatures

- LoRA/checkpoint selector path fails `value_not_in_list`
- missing `LoadImage` input blocks smoke
- nested custom-node repo ignored by parent git repo
- alias silently described as original asset
- source-known dependencies left unstaged, causing the same hard stop to reappear at deployment
- disconnected or muted source workflow nodes omitted from the Step 01 dependency scan
- cloned custom-node source incorrectly reported as registered without a ComfyUI restart and prompt validation
- hidden preprocessor/checkpoint default missed because it is not visible in the workflow JSON
- custom node tries `hf_hub_download()` or `snapshot_download()` during branch smoke
- model is staged in a generic ComfyUI folder but the custom node expects its own package cache path
- mirror or token is needed for download, but credentials are accidentally copied into artifacts
- URL/repository/provider searches are repeated in Step 00 or later validation steps instead of being centralized in Step 01

## Evidence standard

Retain asset ledger, source mapping, per-node dependency scan coverage, wrapper-source evidence for hidden runtime assets, acquisition log, custom-node commit list, install logs when installation actually happens, and remaining hard-stop list.

When using mirrors or credentials, retain only non-sensitive evidence: endpoint/mirror name, repo or source URL, target path, size, checksum, and whether a token was used. Do not retain the token value.

Retain provider attempt evidence for frontend progress: candidate provider, target path, total bytes when known, downloaded bytes, speed/ETA when executing, completion state, and redacted failure reason.

## Hard stops

Stop if a critical source-identical asset is missing and no approved alias/fallback exists.

Stop before deployment if critical dependencies are only `source reachable but not staged`; acquire or stage them first in an isolated workflow cache.

Stop before branch smoke if a selected custom-node wrapper has a runtime auto-download path and the required file is not already staged in the exact path that wrapper checks.

Stop and document blockers after all approved search/download candidates fail. Do NOT write gate keywords in artifacts. Do not silently defer unresolved source acquisition to feasibility, environment deployment, or smoke validation.

## Completion criteria

Step 01 is complete only when one of these terminal states is true:

1. **Resolved/staged**: required source-identical assets, hidden runtime assets, input media, and custom-node source repositories are present in exact expected paths or isolated cache paths, with size/checksum/source/commit evidence and no pending transfer.
2. **Human gate**: unresolved items remain after bounded attempts, and the artifacts list the exact missing items, attempted providers, redacted commands/URLs, failures, and requested human decision.

Both states require `source_node_count == dependency_scanned_node_count` and `missing_dependency_scan_node_ids == none`.

Step 01 is not complete when any Step 00 source node lacks a dependency scan row, it only generated candidate URLs, only confirmed that a source might exist, left download/copy/clone jobs running, skipped hidden runtime asset inspection, used an unapproved alias, leaked credentials, or made runtime/registration/XPU claims that belong to later steps.

## Output schema

`asset_name`, `requested_name`, `resolved_path`, `source`, `state`, `staged_path`, `custom_node_repo`, `custom_node_cache_path`, `wrapper_source_evidence`, `commit`, `install_status`, `acquisition_status`, `mirror_used`, `credential_recorded`, `source_node_count`, `dependency_scanned_node_count`, `missing_dependency_scan_node_ids`, `node_dependency_scan`, `gap`.

Write the primary outputs as `01-assets.csv` and `01-custom-nodes.md`. For large workflows, also write `01-node-dependency-scan.csv`, but keep the scan count and missing-node summary in the Markdown report.
