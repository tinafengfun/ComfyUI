# Asset and custom-node resolution prompt

## Task

Resolve all workflow dependencies: models, LoRAs, input media, custom nodes, nested repositories, and optional services.

This is logical Step 01 in the current backend flow. It is the first step that may perform broad source search and controlled acquisition. Consume Step 00 as an inventory/routing artifact; do not repeat Step 00's full preflight except to validate changed inputs or missing evidence.

Numbering note: this file keeps the legacy `03-asset...` filename, but it is the **logical Step 01 asset/custom-node resolution prompt**. `prompts/01-feasibility-analysis-prompt.md` is logical Step 02 and must not be used for asset preparation.

## Required context

- workflow JSON
- model roots and `/tmp/hf_models` or shared cache paths
- custom-node directory
- network/download policy
- Step 00 preflight artifact, especially dependencies marked `source hinted for Step 01`, `source known`, `source unknown`, or `access blocked`
- approved source context such as `model_repo`, `huggingface_mode.md`, SSH source hints, local source roots, provider tokens available only in runtime environment variables, and operator-provided notes

## Constraints

1. Treat workflow-side `LoadImage` or video assets as first-class dependencies.
2. Do not hide missing proprietary assets.
3. Mark compatibility aliases as smoke-only unless source identity is proven.
4. Keep source resolution, dependency acquisition, installation, and validation as separate states.
5. Downloading a model or cloning a custom-node repository into a workflow cache is not proof that ComfyUI can load it.
6. Do not write credentials, tokens, passwords, or private connection strings into artifacts.
7. Restart ComfyUI after installing or patching custom nodes before trusting validation.
8. Do not redo broad source searches in later steps unless a later validation error introduces a new concrete dependency.
9. Do not mark Step 01 complete while downloads, copies, clones, checksum checks, or source searches are still running.
10. Do not claim ComfyUI registration, XPU compatibility, prompt validation, branch smoke, or output quality from Step 01 evidence.
11. Scan dependency requirements for **every node reported by Step 00**, not only output nodes, critical paths, or nodes already known to need models.
12. If Step 00 has missing node-scan coverage, stop and rerun/fix Step 00 before asset acquisition.

## Steps

1. Read Step 00's all-node scan coverage table or `00-node-scan.csv`; verify source node count, scanned node count, and missing node IDs.
2. For every source node, extract model, LoRA, VAE, CLIP, UNet, checkpoint, image, mask, video, repository, service, and custom-node package references. If a node has no asset dependency, record `no asset dependency`.
3. For every selected custom-node type, inspect the node wrapper source for hidden/default model assets, especially `from_pretrained()`, `hf_hub_download()`, `snapshot_download()`, `load_file()`, `torch.load()`, default `ckpt_name`, and package-specific cache directories. If source is unavailable, record `wrapper scan blocked` for the affected node/type.
4. Search local roots first, then approved source registries/remotes/providers in this order. When the reusable asset tool pool is available, use it to keep search/download logs out of the agent context:
   - explicit local roots and staged workflow cache
   - exact SSH/shared-disk filename search
   - explicit HuggingFace file/repo URLs, then HuggingFace-compatible mirrors such as `hf-mirror.com` and `huggingface.co`
   - `www.civitai.com` and other approved model providers
   - GitHub repositories and `comfy.icu` for custom nodes
   - operator-provided source notes
5. Record whether each dependency is already staged, source-known but not staged, source-unknown, access-blocked, runtime-auto-download hidden asset, or a smoke-only alias candidate.
6. If hard stops are caused by `source reachable but not staged` dependencies and the user approves acquisition, copy/download exact model files into an isolated workflow cache that mirrors ComfyUI's model layout and the custom node's own cache layout.
7. If required custom-node sources are known and the user approves acquisition, clone the source repositories into the isolated workflow cache and record upstream commits.
8. Do not mark cloned custom-node repositories as installed/registered until environment deployment and prompt validation prove that.
9. Record unresolved sources and any aliases.

## Output

Create `01-assets.csv` and `01-custom-nodes.md` with:

- requested name
- resolved path or missing status
- source URL/cache/source root
- staged path
- custom-node cache path or hidden runtime-download path, if applicable
- source-identical, compatibility alias, or unresolved
- custom-node repo, commit, install status, and notes
- acquisition log when downloads or clones occurred, including source path, target path, file size, repo commit, and remaining hard stops
- attempted source list and failure reasons when all providers fail, so the frontend can show a human-intervention gate with concrete next actions
- source node count, dependency-scanned node count, and missing dependency-scan node IDs
- node dependency scan coverage, with one row per source node: node ID, type, dependency references, hidden asset scan status, custom-node source status, resolved state, and gap/action. This may be a table in `01-custom-nodes.md` or a linked `01-node-dependency-scan.csv`.

## Completion criteria

Step 01 has exactly two valid terminal outcomes.

1. **Resolved/staged**: every required source-identical model/input/hidden runtime asset and every required custom-node source is resolved to an exact staged path or recorded cloned source commit. The ledger includes source, target path, size/checksum when available, cache path, and whether any alias is smoke-only.
2. **Human gate**: after bounded local/SSH/provider attempts, unresolved items remain. The artifact lists exact missing assets, attempted providers, redacted commands/source URLs, failure reasons, and the human decision required.

Both terminal outcomes require full node coverage: every source node from Step 00 must have a dependency scan row, even when the row says `no asset dependency`.

Step 01 is not complete if any Step 00 node is missing from the dependency scan, if provider candidates exist but files are not staged, if a download subjob is still running, if hidden runtime assets were not inspected or explicitly blocked, if a smoke-only alias is undocumented or unapproved, if a custom-node clone is reported as installed/registered without later Step 05/06 evidence, or if credentials appear in artifacts.

## Hard stops

Stop before runtime if a critical source-identical model, input asset, or custom-node source is unavailable and the user has not approved a smoke-only alias or reduced-fidelity route.

If the source is known but not staged, stop normal migration work and run a bounded acquisition/staging pass before environment deployment. Do not skip directly to runtime.

If all approved search/download candidates fail, surface a human gate from Step 01 with attempted providers, errors, and required missing assets. Do not push unresolved acquisition work into Step 02+ as repeated background searches.

## Prior-migration lessons

Dasiwa required explicit separation between public assets, compatibility aliases, and unresolved proprietary sources. Missing input images can block smoke runs even when model files exist.

Zimage showed that workflow-visible model selectors are not enough. `AIO_Preprocessor` selected `DepthAnythingV2Preprocessor`, whose checkpoint `depth_anything_v2_vitl.pth` came from a wrapper default and `hf_hub_download()` call rather than a visible workflow widget. Step 01 must inspect selected custom-node wrapper defaults and runtime auto-download code before saying assets are complete. If mirrors or tokens are used, record endpoint/source and downloaded file evidence, but never write credentials into artifacts.

Work-FIsh/Z-Image showed why Step 00 and Step 01 must stay separate. Step 00 should only identify local/static dependency state and defer URL/repository/provider work. Step 01 should own broad search, fallback download attempts, checksum/size verification, and human gates after all candidates fail.

## Example output shape

```text
Asset: example-model.safetensors
State: compatibility alias
Resolved path: models/checkpoints/example-model.safetensors
Source: local smoke asset, not original upstream source
Allowed claim: can validate graph reachability
Forbidden claim: source-identical output fidelity

Custom node: ComfyUI-example-node
Commit: <sha>
Install status: cloned to workflow cache, not installed in ComfyUI
Risk: source audit still required before XPU support claim

Hidden runtime asset:
Node: AIO_Preprocessor / DepthAnythingV2Preprocessor
Source evidence: node wrapper default ckpt_name and hf_hub_download call
Asset: depth_anything_v2_vitl.pth
Expected path: custom_nodes/comfyui_controlnet_aux/ckpts/depth-anything/Depth-Anything-V2-Large/
State: source reachable but not staged
Credential rule: mirror/token used only in environment, not written to artifact
```
