# WanVideoWrapper Intel XPU review summary

This review applies the intent of `docs/intel-xpu-workflow-review-prompt.md` to a **custom-node package** instead of a workflow:

1. inventory the package first
2. separate package registration from family runtime proof
3. allow workflow-backed smoke evidence only when the nodes can be mapped back to exported package families
4. keep optional gaps and blocked accelerators explicit

## Scope

- package: `kijai/ComfyUI-WanVideoWrapper`
- local path: `custom_nodes/ComfyUI-WanVideoWrapper`
- audited commit: `df8f3e49daaad117cf3090cc916c83f3d001494c`

## Review inputs

- `docs/wan-xpu-source-audit.md`
- `docs/wan-xpu-support-matrix.md`
- `docs/artifacts/wan/reports/bootstrap-validation.md`
- `docs/artifacts/wan/reports/core-smoke-evidence.md`
- `docs/artifacts/wan/baseline/startup-after-install.json`

## Coverage summary

| Item | Count | Notes |
| --- | ---: | --- |
| audited family rows | 19 | package-level family inventory from the support matrix |
| retained package bootstrap checkpoints | 2 | pre-install failure, post-install registration success |
| package node surface after install | 190 | Wan-related nodes seen in `object_info` |
| smoke-backed families | 2 | core Wan generation and Qwen helpers |
| registration-success-only families | 14 | registered on Intel XPU but still lack family-level smoke |
| smoke-candidate families | 1 | context / memory / block controls |
| optional-gap families | 1 | `FantasyPortrait` missing `onnx` |
| blocked accelerator rows | 1 | NVIDIA-only acceleration extras such as `sageattention` |

## What is actually covered

### Bootstrap / registration coverage

Covered:

- local checkout established
- root requirements installed
- package registration succeeds on `torch 2.11.0+xpu`
- optional-family failure no longer blocks package load

This is strong package-level evidence and much healthier than the original pre-install baseline.

### Direct runtime evidence

The following families have retained smoke-backed evidence:

- core Wan generation family
  - via retained B70 smoke outputs that exercised `WanFirstLastFrameToVideo` and `WanMultiFrameRefToVideo`
- Qwen helper family
  - via retained B70 smoke evidence covering `Qwen3_VQA`

This is valid because those nodes are exported by the current package surface and the evidence bundle is retained.

### Still not fully covered

The following remain registration-only, not runtime-proven:

- model loading
- utility/cache/compile helpers
- `WanMove`
- `SCAIL`
- `ReCamMaster`
- `Ovi`
- `Lynx`
- `MultiTalk`
- `HuMo`
- `Mocha`
- `FlashVSR`
- `LongCat/LongVie2`
- `Uni3C/UniAnimate/OneToAll/SteadyDancer/MTV`
- `FantasyTalking`

### Explicit gaps

- `FantasyPortrait` — optional gap due to missing `onnx`
- NVIDIA-only acceleration extras such as `sageattention` — blocked in the current Intel environment

## Review conclusion

WanVideoWrapper is now in a materially stronger state than before:

1. package registration on Intel XPU is proven
2. core Wan and Qwen package families have retained smoke-backed evidence
3. optional failures degrade cleanly instead of blocking package import

But the honest support statement is still tiered:

- **package bootstrap: proven**
- **core runtime families: partially smoke-backed**
- **many optional families: registration-only**
- **some extras: blocked or dependency-gapped**

## Non-overclaim rule

Do **not** describe WanVideoWrapper as “fully migrated to Intel GPU”.

The review-supported statement is:

- the package is now **bootstrapped, registered, and partially smoke-backed on Intel XPU**
- but package-wide family coverage is still incomplete
