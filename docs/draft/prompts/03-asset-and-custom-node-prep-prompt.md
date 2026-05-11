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
4. Restart ComfyUI after installing or patching custom nodes before trusting validation.

## Steps

1. Extract all model, LoRA, VAE, CLIP, UNet, checkpoint, image, mask, and video references.
2. Search local roots first, then approved remote sources.
3. Stage resolved assets into the expected ComfyUI layout.
4. Clone/install required custom nodes and record upstream commits.
5. Record unresolved sources and any aliases.

## Output

Create an asset/custom-node ledger with:

- requested name
- resolved path or missing status
- source URL/cache/source root
- staged path
- source-identical, compatibility alias, or unresolved
- custom-node repo, commit, install status, and notes

## Hard stops

Stop if a critical source-identical model or input asset is unavailable and the user has not approved a smoke-only alias or reduced-fidelity route.

## Prior-migration lessons

Dasiwa required explicit separation between public assets, compatibility aliases, and unresolved proprietary sources. Missing input images can block smoke runs even when model files exist.

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
Install status: installed and registered
Risk: source audit still required before XPU support claim
```
