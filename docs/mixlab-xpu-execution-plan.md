# Mixlab Intel XPU execution plan

This document turns the Mixlab source audit and support matrix into an **implementation sequence** for Intel XPU migration.

It is intentionally package-centric.

## Objective

Create a **truthful, publishable, tiered-support migration** for `MixLabPro/comfyui-mixlab-nodes` on Intel XPU.

The goal is **not** to make every family green before publishing. The goal is to deliver:

- a stable install/import/registration story
- a family-level support matrix
- representative runtime evidence
- explicit CPU fallback declarations
- explicit blocked-family declarations

## Acceptance target

Mixlab is accepted when:

1. the package scope and upstream commit are frozen
2. install/import/registration behavior is documented
3. major families are classified honestly
4. representative tested families have retained evidence
5. blocked families are explicit instead of hidden
6. release docs let the next engineer continue from a known state

## Executed outcome snapshot

The work has already moved past zero:

1. package-level node migration standards were added under `docs/`
2. Mixlab source audit is complete
3. first-pass support posture is now documented by family
4. guarded Wave 1 bootstrap validation now has retained baseline-vs-patched evidence under `docs/artifacts/mixlab/`

That means execution should now focus on **stabilizing and validating**, not on guessing package shape.

### Wave 1 validation update

- baseline guarded startup still reproduces the original blocked bootstrap behavior (`pyOpenSSL` auto-install attempt)
- local guarded import and whitelist startup now succeed for validation probes without removing that baseline evidence
- this is a **bootstrap-validation aid**, not a claim that Mixlab's default import path is production-clean

## Constraints

- Do **not** reduce the repo to one hand-picked demo node and claim package success.
- Do **not** silently drop blocked families from the narrative.
- Do **not** call CPU fallback “XPU support”.
- Do **not** let import-time failures be mistaken for runtime-family failures.

## Priority order

### P0 — package bootstrap must be understood first

Before meaningful family migration claims:

1. verify package install command and dependency behavior
2. verify package import behavior
3. verify ComfyUI startup and node registration behavior
4. record which families fail at registration time

This is mandatory because Mixlab has high import-time side effects.

### P1 — cheap wins and infrastructure families

First runtime targets:

1. prompt helpers
2. input/output/UI families
3. image/color/layer/mask families
4. screen-share and utility glue
5. video-plumbing families that are mostly ffmpeg/OpenCV/service orchestration

Expected outcome:

- early package confidence
- install/import stability
- a set of representative family smoke tests

### P2 — moderate-risk model families

Second wave targets:

1. `ClipInterrogator`
2. prompt/text generation families
3. LaMa-like image helper families

Required posture:

- device selection cleanup
- explicit XPU vs CPU evidence
- no overclaiming until family smoke is retained

### P3 — CPU-fallback baseline families

Third wave targets:

1. `Whisper`
2. `SenseVoice`
3. `TripoSR`

Goal:

- prove these families are usable on Intel platforms through **CPU fallback**
- document that this is fallback support, not XPU-native support

### P4 — blocked/high-effort families

Fourth wave targets:

1. `Rembg`
2. `MiniCPM`
3. `FishSpeech`

Goal:

- determine whether any of these can be promoted
- otherwise retain high-quality blocked-case evidence

The release is still valid if these remain blocked, as long as the blocked state is explicit and reproducible.

## Code layout and likely touch points

| Area | Why it likely changes |
| --- | --- |
| `custom_nodes/comfyui-mixlab-nodes/__init__.py` | registration ordering, lazy import guards, family isolation |
| `requirements.txt` / install scripts | platform-sensitive dependency cleanup or optionalization |
| family source files such as `ClipInterrogator.py`, `TextGenerateNode.py`, `Whisper.py`, `SenseVoice.py`, `TripoSR.py`, `RembgNode.py`, `MiniCPMNode.py`, `FishSpeech.py` | device-selection cleanup, fallback handling, import guards |
| `docs/` | source audit, support matrix, test evidence, delivery notes |
| `patches/mixlab-xpu/` | ordered patch bundle once code deltas exist |

## Test strategy by wave

### Wave 1 tests

1. install/import check
2. ComfyUI startup and registration check
3. one representative smoke per low-risk family

### Wave 2 tests

1. representative model-family smoke
2. device-path validation
3. missing-model negative-path check

### Wave 3 tests

1. explicit CPU fallback runs
2. fallback proof in logs or runtime traces
3. statement of value/performance caveat

### Wave 4 tests

1. blocked-case repro
2. exact traceback / failure signature retention
3. blocked-family release note

## Deliverables expected from execution

### Reusable docs already in place

- `intel-xpu-node-migration-checklist.md`
- `intel-xpu-node-test-standard.md`
- `intel-xpu-node-delivery-standard.md`

### Mixlab case docs

- `mixlab-xpu-source-audit.md`
- `mixlab-xpu-support-matrix.md`
- `mixlab-xpu-execution-plan.md`

### Future package outputs

- `patches/mixlab-xpu/README.md`
- ordered patch files
- `docs/artifacts/mixlab/` logs, prompts, generated outputs, and reports

## Success criteria by label

### Valid publishable outcomes

1. **Tiered support package**
   - some families validated on XPU
   - some families CPU fallback only
   - some families blocked

2. **Bootstrap-only package**
   - install/import/registration stabilized
   - support matrix and blocked families documented
   - runtime promotion left to later waves

Both are valid if the evidence and wording are honest.

### Invalid outcome

This is not acceptable:

- one demo workflow succeeds
- blocked families are omitted
- README implies the whole repo works on Intel XPU

## Immediate next implementation steps

1. create or refine package install/import/startup harness
2. validate Wave 1 families first
3. avoid spending early cycles on `Rembg`, `MiniCPM`, or `FishSpeech`
4. build the patch bundle only after family-level evidence exists
