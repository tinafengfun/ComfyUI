# Mixlab Intel XPU review summary

This review applies the intent of `docs/intel-xpu-workflow-review-prompt.md` to a **custom-node package** instead of a workflow:

1. inventory the package surface first
2. separate bootstrap evidence from family runtime evidence
3. do not promote a family unless retained evidence exists
4. keep fallback-only and blocked families explicit

## Scope

- package: `MixLabPro/comfyui-mixlab-nodes`
- local path: `custom_nodes/comfyui-mixlab-nodes.disabled`
- audited commit: `32b22c39cbe13b46df29ef1b6ab088c2eb4389d2`

## Review inputs

- `docs/mixlab-xpu-source-audit.md`
- `docs/mixlab-xpu-support-matrix.md`
- `docs/artifacts/mixlab/reports/bootstrap-hardening.md`
- `docs/artifacts/mixlab/reports/cpu-fallback-validation.md`
- `docs/artifacts/mixlab/reports/blocked-family-triage.md`

## Coverage summary

| Item | Count | Notes |
| --- | ---: | --- |
| audited family rows | 17 | package-level family inventory from the support matrix |
| package bootstrap checkpoints | 3 | blocked baseline, guarded import/startup, bootstrap-hardened startup |
| native-XPU validated families | 0 | no retained family smoke exists yet for current `xpu-candidate` rows |
| CPU-fallback validated families | 3 | `Whisper`, `SenseVoice`, `TripoSR` |
| service / XPU-not-meaningful families | 2 | OpenAI/cloud LLM and cloud image/video APIs |
| blocked families | 3 | `Rembg`, `MiniCPM`, `FishSpeech` |
| still-unvalidated XPU-candidate families | 9 | current `xpu-candidate` rows remain audit-only or bootstrap-only |

## What is actually covered

### Bootstrap / registration coverage

Covered:

- baseline failure was reproduced honestly
- guarded import/startup was reproduced
- bootstrap hardening was completed
- current quick startup succeeds in the local environment

This proves the package is **bootstrappable enough to continue migration work**. It does **not** prove repo-wide runtime support.

### Direct runtime evidence

Covered with retained runtime evidence:

- `Whisper` — CPU fallback validated
- `SenseVoice` — CPU fallback validated
- `TripoSR` — CPU fallback validated

### Explicitly blocked

- `Rembg`
- `MiniCPM`
- `FishSpeech`

These remain visible because they have retained blocked-case evidence, not just source suspicion.

## Review conclusion

The Mixlab migration is **not missing from the package-review process anymore**, but it is also **not a native Intel-XPU-complete package**.

The honest support statement is:

1. package bootstrap and registration have been stabilized enough for continued work
2. three families are truly usable today as **CPU fallback only**
3. three families are still **blocked**
4. the remaining nine `xpu-candidate` families are still **unvalidated for runtime**

## Non-overclaim rule

Do **not** describe Mixlab as “migrated to Intel GPU” without the qualifier that:

- current strong evidence is mostly **bootstrap success + CPU fallback support**
- not retained native-XPU family execution coverage

That is the main review finding for this package.
