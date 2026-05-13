# Asset and custom-node prep prompt

## Task

Resolve all workflow dependencies: models, LoRAs, input media, custom nodes, nested repositories, and optional services.

## Required context

- workflow inventory report
- model roots and `/tmp/hf_models` or shared cache paths
- custom-node directory
- network/download policy

## Constraints

1. Treat workflow-side `LoadImage` or video assets as first-class dependencies.
2. Do not hide missing proprietary assets.
3. Mark compatibility aliases as smoke-only unless source identity is proven.
4. Keep source resolution, dependency acquisition, installation, and validation as separate states.
5. Downloading a model or cloning a custom-node repository into a workflow cache is not proof that ComfyUI can load it.
6. Do not write credentials, tokens, passwords, or private connection strings into artifacts.
7. Restart ComfyUI after installing or patching custom nodes before trusting validation.

## Steps

1. Extract all model, LoRA, VAE, CLIP, UNet, checkpoint, image, mask, and video references.
2. For every selected custom-node type, inspect the node wrapper source for hidden/default model assets, especially `from_pretrained()`, `hf_hub_download()`, `snapshot_download()`, `load_file()`, `torch.load()`, default `ckpt_name`, and package-specific cache directories.
3. Search local roots first, then approved remote sources or mirrors.
4. Record whether each dependency is already staged, source-known but not staged, source-unknown, access-blocked, runtime-auto-download hidden asset, or a smoke-only alias candidate.
5. If hard stops are caused by `source reachable but not staged` dependencies and the user approves acquisition, copy/download exact model files into an isolated workflow cache that mirrors ComfyUI's model layout and the custom node's own cache layout.
6. If required custom-node sources are known and the user approves acquisition, clone the source repositories into the isolated workflow cache and record upstream commits.
7. Do not mark cloned custom-node repositories as installed/registered until environment deployment and prompt validation prove that.
8. Record unresolved sources and any aliases.

## Output

Create an asset/custom-node ledger with:

- requested name
- resolved path or missing status
- source URL/cache/source root
- staged path
- custom-node cache path or hidden runtime-download path, if applicable
- source-identical, compatibility alias, or unresolved
- custom-node repo, commit, install status, and notes
- acquisition log when downloads or clones occurred, including source path, target path, file size, repo commit, and remaining hard stops

## Hard stops

Stop before runtime if a critical source-identical model, input asset, or custom-node source is unavailable and the user has not approved a smoke-only alias or reduced-fidelity route.

If the source is known but not staged, stop normal migration work and run a bounded acquisition/staging pass before environment deployment. Do not skip directly to runtime.

## Prior-migration lessons

Dasiwa required explicit separation between public assets, compatibility aliases, and unresolved proprietary sources. Missing input images can block smoke runs even when model files exist.

Zimage showed that workflow-visible model selectors are not enough. `AIO_Preprocessor` selected `DepthAnythingV2Preprocessor`, whose checkpoint `depth_anything_v2_vitl.pth` came from a wrapper default and `hf_hub_download()` call rather than a visible workflow widget. Step 3 must inspect selected custom-node wrapper defaults and runtime auto-download code before saying assets are complete. If mirrors or tokens are used, record endpoint/source and downloaded file evidence, but never write credentials into artifacts.

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
