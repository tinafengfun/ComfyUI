# Dasiwa B60 end-to-end test plan

This document defines the end-to-end coverage for migrating `DaSiWa-WAN2.2图生视频流-支持单图_双图_三图出视频json.json` to Intel XPU B60.

The repo now has a proven **reduced-resource smoke path** for all three output branches while the original workflow JSON remains unchanged.

## Test goals

1. Cover the workflow's **single-image**, **dual-image**, and **triple-image / multi-frame-reference** branches.
2. Distinguish:
   - workflow wiring correctness
   - custom-node loading correctness
   - model availability
   - branch-specific runtime/XPU failures
3. Create a test set that is realistic enough to catch quality regressions without requiring full production-length runs for every iteration.

## Test layers

| Layer | Purpose | Expected artifact |
| --- | --- | --- |
| Asset readiness | prove models + custom nodes exist | strict inventory report |
| Prompt conversion | prove workflow JSON converts cleanly | API prompt JSON |
| Branch smoke test | prove each scenario can complete a minimal run | per-branch output + history |
| Full branch validation | prove branch semantics remain correct | output file + metadata + prompt/history |
| Full workflow run | prove multi-output workflow works as a whole | all final outputs + consolidated report |

## Shared test inputs

The workflow name explicitly targets:

- single-image to video
- dual-image to video
- three-image / multi-frame reference to video

So the baseline test set should include:

| Input set | Content target | Why |
| --- | --- | --- |
| `S1-single-boxing` | one human action photo with clear motion cues | stress the single-image animation path |
| `S2-dual-transition` | first frame and last frame with visible pose change | exercise `WanFirstLastFrameToVideo` |
| `S3-triple-reference` | three images with staged pose progression | exercise `WanMultiFrameRefToVideo` |
| `S4-clean-indoor-character` | portrait/character set with stable lighting | easier quality baseline when motion-heavy examples fail |

## Prompt set

Use a compact but representative prompt pack.

### P1 — motion-heavy sports

**Positive**

> 室内拳击训练场景，主体快速移动并出拳，镜头跟随动作，保留明显的身体重心变化、手臂运动轨迹和动态冲击感，画面连续自然。

**Negative**

> 静止不动，动作断裂，人物漂移，肢体错位，额外手臂，额外腿部，低清晰度，模糊，闪烁，过曝，欠曝，严重拖影。

### P2 — clean character motion

**Positive**

> 室内人物半身到全身动作视频，主体缓慢转身并有自然的手部和腰部动作，光线稳定，细节清晰，画面连续。

**Negative**

> 动作抖动，脸部崩坏，肢体畸形，闪烁，噪点，背景破碎，静止帧，重复帧。

### P3 — multi-frame reference consistency

**Positive**

> 根据多张参考图生成连续动作，保持人物身份一致、服装一致、发型一致，动作在多帧之间自然衔接，镜头平稳。

**Negative**

> 身份漂移，服装变化，发型变化，镜头跳变，帧间不连续，画面闪烁，重复动作。

## Scenario matrix

| Scenario ID | Branch target | Inputs | Prompt | Minimum pass condition |
| --- | --- | --- | --- | --- |
| `B1-single-image-smoke` | single-image branch | `S1-single-boxing` | `P1` | one valid output file exists |
| `B2-dual-image-smoke` | first/last-frame branch | `S2-dual-transition` | `P2` | one valid output file exists |
| `B3-triple-image-smoke` | multi-frame-ref branch | `S3-triple-reference` | `P3` | one valid output file exists |
| `B4-single-image-quality` | single-image branch | `S4-clean-indoor-character` | `P2` | output passes metadata + manual visual review |
| `B5-full-workflow` | all outputs | mixed workflow input set | branch-specific prompt bindings | all intended outputs present |

## Validation checklist per run

Every promoted test should capture:

1. workflow JSON path
2. generated API prompt path
3. launch flags
4. output node(s) exercised
5. output file existence
6. codec / frame count / width / height / duration
7. prompt history or API history
8. failing node id if the run aborts

## Suggested execution order

1. `workflow_asset_inventory.py --strict`
2. prompt conversion with `workflow_to_prompt.py`
   - for the preserved original workflow path, use `script_examples/dasiwa_b60_branch_smoke.sh` to generate migration-safe branch prompts without editing the source workflow JSON
3. before live smoke runs, apply the local custom-node compatibility patches and stage smoke assets:
   - `bash script_examples/dasiwa_b60_apply_xpu_node_patches.sh`
   - `bash script_examples/dasiwa_b60_stage_smoke_assets.sh`
4. branch-only smoke tests in this order:
    - `B1-single-image-smoke`
    - `B2-dual-image-smoke`
    - `B3-triple-image-smoke`
5. once all three pass, run:
    - `B4-single-image-quality`
    - `B5-full-workflow`

## Current B60 smoke outcome

The following reduced-resource branch smokes were executed successfully on Intel B60/XPU against the preserved workflow:

| Branch | Output node | Runtime overrides | Result |
| --- | --- | --- | --- |
| single-image | `54` | `51.Number=512`, `75.Number=17`, sampler `steps=2` | success |
| dual-image | `131` | `128.Number=512`, `153.Number=17`, sampler `steps=2` | success |
| triple-image | `208` | `218.value=512`, `213.Number=17`, sampler `steps=2` | success |

Use `script_examples/workflow_branch_runner.py --set-input NODE.INPUT=VALUE` to apply these smoke-only overrides without editing the source workflow JSON.

The smoke asset staging helper must be run before these tests because it now also:

1. installs the compatibility low-noise UNet aliases into `models/diffusion_models/`
2. stages the extra third-reference input fixture required by branch `208`

## Prescreen vs full-run policy

Use branch-only runs when:

- validating missing custom-node fixes
- validating model availability
- testing XPU operator compatibility
- testing cleanup/helper-node behavior

For the current B60 smoke path, two proprietary low-noise UNets are still not publicly resolvable. The smoke-stage helper installs explicit compatibility aliases to the closest available `smoothMix_Wan2214B-I2V_i2v_V20_Low.safetensors` artifact so the preserved workflow can execute unchanged while the original filenames remain documented as unresolved source gaps.

At the original workflow scale, branch `54` still hit `UR_RESULT_ERROR_OUT_OF_DEVICE_MEMORY` during `KSamplerAdvanced` on the 24 GB target. That remains the main blocker for full-size branch validation.

Use full workflow runs when:

- proving final migration readiness
- validating all outputs together
- collecting final benchmark and artifact evidence

## Expected archived artifacts

For each major scenario, keep:

- prompt JSON
- history JSON
- console/log summary
- output metadata summary
- node timing / XPU telemetry when available
- manual review notes for quality-sensitive runs

## Final hand-off expectation

The migration is not ready to hand off until the repo contains:

- this test plan
- the actual executed case list
- result summaries for each promoted scenario
- reproduction commands for rerunning the successful cases
