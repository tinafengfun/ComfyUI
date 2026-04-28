# WanVideoWrapper bootstrap validation

This report summarizes the first retained Intel XPU bootstrap pass for `ComfyUI-WanVideoWrapper`.

## Scope

- package: `custom_nodes/ComfyUI-WanVideoWrapper`
- upstream commit: `df8f3e49daaad117cf3090cc916c83f3d001494c`
- runtime: `ComfyUI 0.19.3` + `torch 2.11.0+xpu`

## Baseline result before installing root requirements

Initial package registration failed in a clean local baseline because a **required module** depended on `ftfy`, which was not installed yet.

Failure evidence:

- `docs/artifacts/wan/baseline/startup-probe.log`
- `docs/artifacts/wan/baseline/startup-probe.json`

Important interpretation:

- this was a **dependency-preparation gap**
- it was **not** yet evidence of an Intel-XPU-specific execution failure

## Result after installing root requirements

After running:

```bash
./.venv-xpu/bin/pip install -r custom_nodes/ComfyUI-WanVideoWrapper/requirements.txt
```

the package successfully registered on the Intel XPU ComfyUI runtime.

Retained evidence:

- `docs/artifacts/wan/baseline/startup-after-install.log`
- `docs/artifacts/wan/baseline/object_info-after-install.json`
- `docs/artifacts/wan/baseline/startup-after-install.json`

The post-install baseline captured **190 Wan-related nodes** in `object_info`.

## Current warning surface

The current baseline still emits two meaningful warnings:

1. `sageattention` is unavailable
2. `FantasyPortrait` optional nodes are unavailable because `onnx` is missing

These warnings did **not** prevent package registration.

## Current conclusion

At this stage, the honest package-level statement is:

1. baseline checkout established
2. root requirements installed
3. package registration on Intel XPU proven
4. optional-family coverage still incomplete
5. family-level smoke validation still pending

This promotes the package from **not-yet-bootstrapped** to **registration-success**, but not yet to broad runtime support.
