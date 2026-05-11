# Mixlab Intel XPU review summary

This review applies the intent of `docs/intel-xpu-workflow-review-prompt.md` to a **custom-node package** instead of one workflow JSON.

For Mixlab, the package-level equivalents are:

1. **workflow node inventory** -> package family inventory
2. **prompt conversion coverage** -> package bootstrap + family routing coverage
3. **full-run evidence** -> retained package startup evidence + family smoke logs
4. **branch-smoke gap closure** -> family-by-family smoke / CPU-fallback / blocked-case evidence

## Scope

- package: `MixLabPro/comfyui-mixlab-nodes`
- local path: `custom_nodes/comfyui-mixlab-nodes.disabled`
- audited commit: `32b22c39cbe13b46df29ef1b6ab088c2eb4389d2`

## Authoritative review inputs

- `docs/mixlab-xpu-source-audit.md`
- `docs/mixlab-xpu-support-matrix.md`
- `docs/artifacts/mixlab/reports/bootstrap-hardening.md`
- `docs/artifacts/mixlab/reports/cpu-fallback-validation.md`
- `docs/artifacts/mixlab/reports/blocked-family-triage.md`
- `docs/artifacts/mixlab/reports/wave-a-device-cleanup.md`
- runtime logs:
  - `docs/artifacts/mixlab/logs/wave-a-clipinterrogator-xpu.log`
  - `docs/artifacts/mixlab/logs/wave-a-textgenerate-xpu.log`
  - `docs/artifacts/mixlab/logs/wave-a-chineseprompt-xpu.log`
  - `docs/artifacts/mixlab/logs/wave-a-lama-xpu.log`
  - `docs/artifacts/mixlab/logs/wave-a-lama-install.log`

## Coverage summary table

This is the package-level replacement for the workflow-review coverage table.

| Item | Count | Notes |
| --- | ---: | --- |
| total audited family rows | 17 | package-level family inventory from `docs/mixlab-xpu-support-matrix.md` |
| structural / XPU-not-meaningful families | 2 | OpenAI/cloud LLM and cloud image/video API families |
| bootstrap checkpoints | 3 | baseline blocked startup, guarded Wave 1 startup, bootstrap-hardened startup |
| native-XPU smoke-backed families | 3 | `ClipInterrogator`, prompt-generation family, `LaMa` |
| CPU-fallback validated families | 3 | `Whisper`, `SenseVoice`, `TripoSR` |
| blocked families | 3 | `Rembg`, `MiniCPM`, `FishSpeech` |
| still-unvalidated XPU-candidate families | 6 | helper/image/video families that remain audit-only or bootstrap-only |

## What is directly covered

### Bootstrap / registration coverage

Covered with retained evidence:

- baseline failure was reproduced honestly
- guarded import/startup was reproduced
- bootstrap hardening was completed
- current quick startup succeeds in the local environment

This proves the package is **bootstrappable and reviewable** on Intel XPU. It does **not** by itself prove runtime support for every family.

### Direct runtime evidence

Covered with retained runtime evidence:

- `ClipInterrogator` — XPU smoke validated
- `PromptGenerate_Mix` / `ChinesePrompt_Mix` — XPU smoke validated
- `LaMa` — XPU smoke validated
- `Whisper` — CPU fallback validated
- `SenseVoice` — CPU fallback validated
- `TripoSR` — CPU fallback validated

### Explicitly blocked

- `Rembg`
- `MiniCPM`
- `FishSpeech`

These remain explicit because they have retained blocked-case evidence, not just source suspicion.

## Unvalidated family mapping

These are the package-level equivalents of “prompt nodes not covered by full run or branch smoke”.

| Family row | Current status | Why it is still unvalidated | Review judgment |
| --- | --- | --- | --- |
| Prompt helpers | `xpu-candidate` | low-risk source posture, but no retained representative XPU smoke yet | deferrable |
| Input/output/UI | `xpu-candidate` | mostly I/O and package glue; no retained representative XPU smoke yet | deferrable |
| Image/color/layer/mask | `xpu-candidate` | source looks portable, but no retained family smoke yet | useful next wave, not blocking package closeout |
| Screen and utility glue | `xpu-candidate` | package/framework glue only; no retained family smoke yet | deferrable |
| P5 | `xpu-candidate` | frontend/input style family; XPU is not the core risk axis | deferrable |
| Video plumbing | `xpu-candidate` | mainly ffmpeg/OpenCV/system-media validation gap, not GPU-kernel gap | deferrable, integration-oriented |

## Critical-path, compute-bound, and replaceability review

This section satisfies the prompt requirement to classify fallback and blocked families by:

- **critical-path importance**
- **compute-bound vs infrastructure-bound**
- **replaceability**

| Family | Current status | Critical path? | Compute-bound or infrastructure-bound? | Replaceable today? | Review outcome |
| --- | --- | --- | --- | --- | --- |
| `ClipInterrogator` | `xpu-smoke` | yes for Wave A | moderate compute, mostly package-local runtime | partly replaceable, but useful package-native capability | covered enough for current migration closeout |
| `PromptGenerate_Mix` / `ChinesePrompt_Mix` | `xpu-smoke` | yes for Wave A | moderate compute, mostly HF runtime/integration | not a blocker if absent, but high-value native package feature | covered enough for current migration closeout |
| `LaMa` | `xpu-smoke` | yes for Wave A | moderate compute, currently more integration-bound than operator-bound | partly replaceable by other inpaint paths, but valuable native feature | covered enough with install-workaround caveat |
| `Whisper` | `cpu-fallback` | no | medium compute, backend/runtime bound | partly replaceable by `SenseVoice` | keep as CPU fallback |
| `SenseVoice` | `cpu-fallback` | no, but valuable | more infrastructure/provider bound than model-port bound | partly replaceable, but strongest current local ASR fallback | keep as CPU fallback |
| `TripoSR` | `cpu-fallback` | no | higher compute + asset/runtime complexity | often replaceable because 3D is extension scope | keep as CPU fallback |
| `Rembg` | `blocked` | no | mostly infrastructure/runtime-contract bound | partly replaceable by mask/layer families | defer as feature work |
| `MiniCPM` | `blocked` | no | both compute-bound and runtime-contract bound | mostly replaceable by already-migrated Qwen/VQA paths | defer as feature work |
| `FishSpeech` | `blocked` | no | infrastructure/import/runtime-contract bound first, compute second | partly replaceable by lighter speech/service paths | defer as feature work |

## Migration summary for the patch bundle

This section is the package-level equivalent of the workflow prompt's “migration summary for the patch bundle”.

### Functional branches now covered

1. package bootstrap / registration stabilization
2. prompt-generation branch on native XPU
3. image-caption / prompt-extraction branch on native XPU
4. inpaint branch on native XPU
5. ASR and 3D delivery through explicit CPU fallback
6. blocked high-effort families kept visible instead of silently bypassed

### Family outcome summary

| Outcome class | Families |
| --- | --- |
| native XPU smoke-backed | `ClipInterrogator`, `PromptGenerate_Mix` / `ChinesePrompt_Mix`, `LaMa` |
| CPU fallback | `Whisper`, `SenseVoice`, `TripoSR` |
| blocked / feature-development | `Rembg`, `MiniCPM`, `FishSpeech` |
| service / XPU-not-meaningful | OpenAI/cloud LLM family, cloud image/video API family |
| still audit-only / unvalidated | helper/UI/image/video-plumbing candidate families |

### NVIDIA/CUDA-oriented gaps that required workarounds or remain explicit

1. hardcoded `cuda/cpu` routing in Wave A nodes
2. upstream `clip-interrogator` ranking path assuming CUDA-style autocast/dtype behavior
3. `simple_lama_inpainting` packaging constraints that are too old for the current Python 3.13 environment
4. explicit `.cuda()` and CUDA cleanup APIs in blocked families

### Concrete code and runtime-policy changes applied

1. `ClipInterrogator.py`
   - moved execution placement to `comfy.model_management.get_torch_device()`
   - selected dtype with Comfy fp16/bf16 helpers
   - added a local dtype-alignment compatibility patch for `clip-interrogator` label ranking on XPU
2. `TextGenerateNode.py`
   - moved translation and generation models to Comfy's execution device
   - replaced hardcoded pipeline device strings with a `torch.device`
   - normalized offload cleanup through `soft_empty_cache()`
3. `Lama.py`
   - moved model placement to Comfy's execution device
   - normalized cleanup through `soft_empty_cache()`
   - validated the current Python 3.13 environment with a `simple_lama_inpainting --no-deps` install workaround

## Review conclusion

The Mixlab migration now satisfies the **package-level version** of the review prompt.

The honest conclusion is:

1. package bootstrap and registration are stabilized
2. all high-priority Wave A families now have retained native-XPU smoke evidence
3. CPU-fallback families are explicitly validated as CPU fallback, not overclaimed as native XPU
4. blocked families are explicit and classified by critical-path importance, compute vs infrastructure posture, and replaceability
5. six lower-priority helper/image/video families remain unvalidated, but they are **not critical blockers** for the package-level migration closeout

## Non-overclaim rule

Do **not** describe Mixlab as “full native Intel GPU parity”.

The acceptable statement is:

> Mixlab Intel XPU migration is complete as a **tiered-support delivery**: bootstrap is stable, three core families have retained native-XPU smoke, three families are delivered as CPU fallback, and three high-effort families remain explicitly blocked.

That is the review finding for this package.
