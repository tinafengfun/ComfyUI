# WanVideoWrapper core smoke evidence

This note links already-retained workflow smoke evidence back to the `ComfyUI-WanVideoWrapper` package case.

It does **not** turn the package back into a workflow-only migration. It simply avoids losing valid runtime evidence for core exported families that already executed successfully.

## Why this counts

The B70 workflow case uses WanVideoWrapper-exported nodes including:

- `Qwen3_VQA`
- `WanFirstLastFrameToVideo`
- `WanMultiFrameRefToVideo`

Those nodes are part of the current local `ComfyUI-WanVideoWrapper` package surface and were exercised in successful smoke runs.

## Retained evidence

Primary references:

- `docs/artifacts/b70/workflow 分析.md`
- `docs/artifacts/b70/完整测试报告.md`
- `docs/artifacts/b70/generated/dasiwa-b70-smoke-o54_00001.mp4`
- `docs/artifacts/b70/generated/dasiwa-b70-smoke-o131_00001.mp4`
- `docs/artifacts/b70/generated/dasiwa-b70-smoke-o208_00001.mp4`

Key facts retained there:

1. `Qwen3_VQA` appears three times in the workflow topology
2. `WanFirstLastFrameToVideo` appears once
3. `WanMultiFrameRefToVideo` appears once
4. all three reduced-resource smoke outputs completed successfully

## What this promotes

This evidence is enough to promote the following WanVideoWrapper families from **registration-success** to **smoke-backed**:

- core Wan image/video conversion nodes used by the workflow
- Qwen helper node family represented by `Qwen3_VQA`

## What this does not promote

This evidence does **not** prove:

- package-wide support for every optional family
- full-size geometry success on Intel XPU
- loader-family parity for every WanVideoWrapper model path
- support for families not used in the retained B70 smoke case

So it should be used narrowly and honestly: **core exported runtime nodes have workflow-backed smoke evidence; the rest of the package still needs family-specific validation.**
