# Mixlab XPU gap summary

This document summarizes the current Mixlab cases that should **not** be treated as ordinary “keep patching until XPU works” migration work.

It is derived from the reusable `docs/migration_checklist.md`, especially:

1. **Phase 2: quick triage**
2. **Phase 3: ComfyUI path**
3. **Phase 7: final validation**

The goal is to separate:

- **migratable with normal XPU patching**
- **deliver as CPU fallback**
- **manual integration / environment gap**
- **feature-development gap**
- **not a meaningful ComfyUI-XPU problem**

## 1. Gap classes from the checklist

### A. Direct “do not keep forcing ComfyUI XPU” cases

From the checklist, these should be treated as immediate red flags:

1. **capacity hard stop**
   - smallest practical precision still does not fit target memory
   - no supported multi-GPU/runtime path exists in the current stack
2. **deployment hard mismatch**
   - the real need is API serving, concurrency, or runtime LoRA switching
   - ComfyUI is the wrong primary execution target
3. **runtime contract hard mismatch**
   - the node/package only exposes `cuda`
   - core logic depends on `torch.cuda.*`, `.cuda()`, or CUDA-only kernels
4. **backend/provider hard mismatch**
   - real execution depends on a provider that has no Intel XPU path in the current environment
5. **packaging / environment hard mismatch**
   - the package cannot even be installed cleanly in the target Python/runtime without a workaround

When a case lands here, the correct action is usually:

- **CPU fallback**
- **manual integration**
- **feature-development**
- or **non-ComfyUI route**

not “one more generic XPU patch”.

### B. CPU-fallback delivery cases

These should not be called native XPU migration success.

Typical signs:

1. backend works on CPU but not on XPU
2. model/provider support is uncertain or absent on XPU
3. runtime is usable enough for delivery, but native-XPU ROI is low

### C. Manual-integration cases

These are not blocked by core tensor execution, but by environment setup.

Typical signs:

1. ffmpeg / OpenCV / codec packaging
2. ONNX provider selection
3. model asset staging
4. Python package install quirks
5. cache/bootstrap/download policy

### D. Feature-development cases

These are not “migration checklist cleanup” anymore.

Typical signs:

1. custom CUDA assumptions remain in the active path
2. the node API itself only understands `cuda/cpu`
3. unload / memory logic is CUDA-only
4. distributed / communication / custom-kernel logic would need redesign
5. import tree or vendored subproject is broken before XPU work even begins

## 2. Mixlab-specific gap summary

The table below applies the checklist logic to the current Mixlab package state and records the concrete reason for each conclusion.

| Family | Current status | Checklist interpretation | Concrete reason | Recommended handling |
| --- | --- | --- | --- | --- |
| `ClipInterrogator` | `xpu-smoke` | normal ComfyUI XPU migration | hardcoded `cuda/cpu` routing was removable; the remaining blocker was an upstream dtype/autocast assumption in `clip-interrogator`, which was patchable in-node | keep as migrated; only improve reproducibility |
| `PromptGenerate_Mix` / `ChinesePrompt_Mix` | `xpu-smoke` | normal ComfyUI XPU migration | HF generation/translation path accepted Comfy execution device after device cleanup; no external provider blocker remained | keep as migrated; stage models locally if needed |
| `LaMa` | `xpu-smoke` | packaging/integration gap, not runtime gap | runtime works on XPU, but upstream `simple_lama_inpainting` install path pins old `numpy`/`pillow` ranges and fails on Python 3.13 without a workaround | keep as migrated with install workaround; document packaging workaround |
| `Whisper` | `cpu-fallback` | backend/provider gap | current usable path depends on `faster-whisper` / CTranslate2 behavior; native XPU is limited by backend support rather than Mixlab node logic | deliver as CPU fallback |
| `SenseVoice` | `cpu-fallback` | backend/provider gap | current validated path is CPU ONNX int8; moving to XPU depends on ONNX Runtime provider support and validation, not simple device-string cleanup | deliver as CPU fallback |
| `TripoSR` | `cpu-fallback` | mixed integration + patch gap | wrapper/device cleanup is still incomplete, but the family is also asset-heavy and 3D-specific, so it is not a good baseline XPU priority | deliver as CPU fallback unless 3D becomes a priority |
| `Rembg` | `blocked` | runtime-contract hard mismatch | active BRIA/rembg path still contains `.cuda()`-shaped execution and GPU-oriented packaging assumptions, so the node contract is still NVIDIA-shaped | treat as feature-development work |
| `MiniCPM` | `blocked` | runtime-contract hard mismatch | model init, capability checks, dtype policy, and cleanup still assume CUDA semantics, so this is more than a local routing cleanup | treat as feature-development work |
| `FishSpeech` | `blocked` | import/runtime-contract hard mismatch | vendored dependency/import tree still needs repair before stable model boot; XPU work is blocked by package integration debt first | treat as feature-development work |
| video/media helpers | `manual integration` shape | environment gap | main risk is ffmpeg/OpenCV/container/codec behavior and system packaging, not XPU tensor execution | handle as media-tool integration, not model migration |
| service/API helpers | `xpu-na` | deployment mismatch | these nodes are integration/service shaped, so XPU is not the primary acceptance axis | exclude from native-XPU migration claims |

### 2.1 Reason notes by family

Use these notes when a report needs to explain **why** the family stayed in its current bucket.

#### `Whisper`

- keep as **CPU fallback**
- reason: the meaningful blocker is the upstream inference backend (`faster-whisper` / CTranslate2), not ordinary Mixlab device cleanup
- implication: do not treat lack of native XPU as a local node bug

#### `SenseVoice`

- keep as **CPU fallback**
- reason: the validated value path is CPU ONNX int8; native XPU depends on provider/runtime availability and validation
- implication: this is a provider-support problem before it is a node-porting problem

#### `TripoSR`

- keep as **CPU fallback**
- reason: it combines leftover wrapper cleanup with heavy 3D asset/runtime overhead, but it is not a critical package baseline
- implication: native XPU is optional unless 3D becomes a priority workflow

#### `Rembg`

- keep as **feature-development**
- reason: active path still contains direct `.cuda()` behavior and GPU-specific assumptions in the BRIA/rembg flow
- implication: this is a CUDA-contract rewrite task, not checklist tail cleanup

#### `MiniCPM`

- keep as **feature-development**
- reason: model construction, capability probing, dtype policy, and cleanup are still CUDA-shaped
- implication: requires deliberate refactoring and revalidation, not just replacing device strings

#### `FishSpeech`

- keep as **feature-development**
- reason: package boot/import stability is still unresolved before meaningful XPU runtime work starts
- implication: fix integration debt first, then reopen hardware migration

#### `LaMa`

- keep as **migrated on XPU**
- reason: the unresolved issue is install reproducibility on Python 3.13, not runtime execution
- implication: describe it as a packaging workaround, not as an XPU blocker

## 3. “Cannot migrate” should mean one of these concrete cases

When we say a family is “cannot migrate” or “should not keep migrating right now”, it should map to a specific class:

### 3.1 Not worth continuing in the current ComfyUI XPU lane

Use this when:

1. the family is already useful as CPU fallback
2. the missing native-XPU path belongs to an external backend/provider
3. the family is not on the critical path

Current Mixlab examples:

- `Whisper`
- `SenseVoice`
- `TripoSR`

### 3.2 Not migratable without feature development

Use this when:

1. there is still active `.cuda()` logic
2. CUDA cleanup APIs are part of the family contract
3. the runtime path or vendored code tree still assumes NVIDIA/CUDA

Current Mixlab examples:

- `Rembg`
- `MiniCPM`
- `FishSpeech`

### 3.3 Not a model-migration problem at all

Use this when:

1. the issue is package install policy
2. the issue is ffmpeg/OpenCV/system tooling
3. the issue is service/API integration

Current Mixlab examples:

- `LaMa` normal install path on Python 3.13
- video/media families
- cloud/API families

## 4. Current Mixlab “stop patching here” rules

The following rules should be used for future Mixlab work:

1. **Do not reopen `Whisper` / `SenseVoice` / `TripoSR` as native-XPU work** unless there is new upstream backend/provider evidence.
2. **Do not treat `Rembg` / `MiniCPM` / `FishSpeech` as checklist cleanup tasks.** They are feature projects.
3. **Do not treat `LaMa` as still blocked on XPU runtime.** Its remaining issue is packaging reproducibility.
4. **Do not spend GPU-migration effort on video/media helpers first.** Their main risk is environment/tooling integration.
5. **Do not include service/API families in native-XPU success counts.**

## 5. Recommended wording for future reports

Use wording like this:

- **migrated on Intel XPU with retained smoke**
- **delivered as CPU fallback**
- **blocked by CUDA-shaped runtime contract**
- **blocked by packaging/integration gap**
- **not a meaningful XPU migration target**

Avoid vague wording like:

- “not working yet”
- “needs more patching”
- “maybe fix later”

unless the report also names the exact gap class above.

## 6. Bottom line

The checklist implies that **not every unresolved family should remain in the active migration queue**.

For Mixlab, the current queue split should stay:

1. **migrated and smoke-backed on XPU**
   - `ClipInterrogator`
   - `PromptGenerate_Mix` / `ChinesePrompt_Mix`
   - `LaMa`
2. **delivered as CPU fallback**
   - `Whisper`
   - `SenseVoice`
   - `TripoSR`
3. **feature-development only**
   - `Rembg`
   - `MiniCPM`
   - `FishSpeech`
4. **integration / non-XPU-primary**
   - video/media helpers
   - service/API helpers

That is the current migration-gap conclusion that should be reused in later reviews.
