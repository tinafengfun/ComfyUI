# Intel XPU custom-node test standard

Use this document when validating a **custom-node package migration** to Intel XPU in ComfyUI.

This standard is **package-level, not workflow-level**. The goal is to prove what a custom-node repo can and cannot do on Intel XPU without overclaiming repo-wide support from one successful demo graph.

## Release goals

A package-level validation should let the next engineer answer all of these:

1. Does the custom-node repo install cleanly in the target ComfyUI environment?
2. Does the package import without Intel/XPU-breaking errors?
3. Do the nodes register at ComfyUI startup?
4. Which **node families** were actually exercised?
5. Which families ran on XPU, which fell back to CPU, and which are blocked?
6. Which failures were caused by missing models, missing external services, or hard NVIDIA/CUDA assumptions?
7. What exact artifacts justify each claim?

## Hard constraints

State these explicitly in the test task and final report:

1. **Do not treat package installation success as runtime support.**
2. **Do not treat ComfyUI startup success as proof that all nodes work.**
3. **Do not treat one successful example graph as proof of repo-wide support.**
4. **Do not claim XPU execution unless the device path is evidenced directly.**
5. **Do not hide CPU fallback.** If a family only works on CPU, label it that way.
6. **Do not merge missing-asset failures with XPU-kernel failures.** Keep root causes separate.
7. **Report by node family, not only by repo name.**

## Standard validation layers

| Layer | Purpose | Minimum evidence |
| --- | --- | --- |
| Install readiness | prove dependencies can be installed | exact install command, dependency output, pinned commit or version |
| Import readiness | prove Python modules import | import command/output, traceback if failing |
| Startup + registration | prove ComfyUI discovers the nodes | startup log, registered node names or counts, load errors |
| Family smoke | prove representative node families execute | prompt/workflow, output artifact or explicit non-media success evidence, logs/history |
| Device-path validation | prove XPU vs CPU fallback | device logs, telemetry, runtime trace, fallback note |
| Negative-path validation | prove expected failures are diagnosed honestly | failing command/prompt, error logs, root-cause label |
| Final reporting | prove scope is bounded correctly | per-family status table with pass/fail/blocked and evidence links |

## Phase 1: install and import validation

Before runtime testing, capture:

1. target ComfyUI commit or release
2. target custom-node repo commit or release
3. Python version
4. PyTorch / IPEX / oneAPI-related runtime versions when relevant
5. install method:
   - `git clone`
   - `pip install -r requirements.txt`
   - `pip install -e .`
   - any manual patch or editable install step

Minimum checks:

1. clean install into the intended environment
2. explicit import of the package's Python entry points when feasible
3. explicit import of any native-extension-backed submodule when the repo contains one

If install succeeds but import fails, the family status is already at least **blocked**, even if the repo directory exists.

## Phase 2: ComfyUI startup and node-registration validation

After install/import, start ComfyUI with the intended Intel runtime flags and preserve:

1. full startup command
2. startup log
3. custom-node load messages
4. warnings about missing optional dependencies
5. tracebacks for partial registration failures

The startup check must answer:

1. did the package load fully, partially, or not at all
2. which node classes registered successfully
3. which node classes were skipped or crashed during registration
4. whether registration failure is global or family-specific

Acceptable registration evidence includes:

- startup log lines naming the package
- startup log lines naming registered classes or categories
- ComfyUI node list/API evidence when available
- explicit load-error traceback tied to the package

Do **not** call the repo supported if startup only registers a subset of the expected nodes.

## Phase 3: representative family smoke validation

Test by **representative node family**, not by random examples.

Recommended family grouping:

| Family type | Examples | Why it needs its own result |
| --- | --- | --- |
| Loaders / model-binding | model loaders, tokenizer loaders, checkpoint selectors | often fail on path, dtype, or backend assumptions |
| Core compute | samplers, inferencers, image/video operators, tensor transforms | most likely place for XPU operator gaps |
| Pre/post-process | resize, mask, latent/image conversion, codecs | may hide CPU-only execution |
| Service-backed nodes | caption, VLM, OCR, remote API, database, web service | can fail independently of XPU |
| UI/helper-but-executable nodes | selectors, wrappers, dispatchers | may prune or reroute the real path |

For each family, run at least one **minimal representative smoke case** that:

1. reaches the family under test
2. produces the family's intended output or a clear non-media success condition
3. uses the smallest realistic assets and settings that still exercise the code path

Promote more than one smoke case when:

- the repo has separate image, video, audio, or text branches
- the repo has both local-model and service-backed execution modes
- the repo has materially different CUDA and non-CUDA code paths

## Phase 4: device-path validation

A family is not **XPU-supported** unless the report shows that the meaningful compute path actually ran on XPU.

### Required proof standard

Prefer at least **two independent signals** from this list:

1. runtime log naming `xpu`, `intel`, `Level Zero`, `oneAPI`, or the actual XPU device
2. operator/device trace showing tensors or modules placed on XPU
3. XPU telemetry spike aligned with the test window
4. node/package debug output explicitly selecting XPU
5. absence of CPU-fallback warning plus positive XPU placement evidence

### CPU fallback policy

If the family completes only because it fell back to CPU:

- report the family as **cpu-fallback**, **not xpu-pass**
- preserve the fallback log line or other evidence
- note whether the fallback is intentional, partial, or accidental
- state the performance and release implication if known

### Unsupported mixed-device policy

If the package uses split execution:

- identify which sub-step ran on XPU
- identify which sub-step ran on CPU
- do not collapse the result into a single unqualified “pass”

## Phase 5: negative-path validation

Every package-level review should include deliberate negative checks for the main failure classes.

### Required negative classes

| Negative class | What to prove |
| --- | --- |
| Missing model/assets | package reports missing checkpoints, configs, or fixture files clearly |
| Missing service/dependency | package fails clearly when remote/local service is absent |
| Unsupported CUDA-only path | package surfaces CUDA/NVIDIA assumptions honestly instead of silently misbehaving |
| Bad device selection | invalid `cuda`/`xpu`/`cpu` request is handled or diagnosed clearly |
| Partial registration | startup shows which nodes failed instead of hiding the gap |

### CUDA-path checks

Look specifically for:

- hardcoded `cuda`
- `.cuda()` calls
- `torch.cuda`-only guards
- Triton/CUDA extension imports
- NVIDIA-only environment assumptions

If the repo still requires a CUDA-only branch for some family, mark that family **blocked** or **nvidia-only**, depending on the evidence.

## Artifact preservation standard

For every promoted pass, fail, or blocked claim, preserve:

1. exact command
2. package commit and test date
3. startup log or runtime log
4. prompt/workflow or direct Python invocation used
5. output artifact path, or explicit statement that the case is non-media
6. device-path evidence
7. error traceback for failures
8. short root-cause label

Recommended package layout:

```text
docs/
  intel-xpu-node-test-standard.md
  artifacts/
    <node-case>/
      logs/
      prompts/
      telemetry/
      generated/
      reports/
```

If the real run happened on another machine, sync the logs, prompts, telemetry, and outputs back before publishing conclusions.

## Per-family reporting format

Final reporting must be **by family**.

Use a table like this:

| Family | Representative nodes | Status | Device result | Evidence | Notes |
| --- | --- | --- | --- | --- | --- |
| loader family | `FooLoader`, `BarLoader` | pass / fail / blocked | xpu / cpu-fallback / mixed / unknown | artifact paths | root cause or scope note |

### Status vocabulary

| Term | Meaning |
| --- | --- |
| **pass** | family completed the intended representative case with preserved evidence |
| **fail** | family was executed and produced a reproducible failure |
| **blocked** | family could not be fairly tested because a prerequisite gap is still open |
| **cpu-fallback** | family works only through CPU execution and must not be claimed as XPU success |
| **mixed** | family uses both XPU and CPU in a material way |
| **unknown** | evidence is insufficient; do not promote a claim |

Use **blocked** when the root cause is outside the family runtime itself, for example:

- missing proprietary model
- unavailable service endpoint
- missing closed-source extension
- environment prerequisite not yet satisfied

## Rules against overclaiming

These are mandatory:

1. Do **not** say “the repo supports Intel XPU” unless all material families are covered and no unresolved family remains hidden.
2. If only a subset passed, say: **these families were validated on Intel XPU**.
3. If a family only passed under smoke settings, say **smoke-only pass**, not production-ready pass.
4. If a family used compatibility assets or alternative models, label them clearly and do not present them as source-identical proof.
5. If the package started but some nodes never registered or never ran, report the missing families explicitly.
6. If all evidence comes from one workflow branch, do not generalize to unrelated families in the same repo.

Preferred conclusion language:

- acceptable: `The repo has verified Intel XPU support for the sampler and preprocessing families, CPU fallback for captioning, and blocked status for the CUDA-only extension family.`
- not acceptable: `The repo works on Intel XPU.`

## Minimum acceptance checklist

The package-level validation is not complete unless all of these are true:

- install command and environment were recorded
- import behavior was checked
- ComfyUI startup and node registration were checked
- representative smoke tests were run by family
- XPU vs CPU execution path was evidenced directly
- missing-model and missing-service failures were separated from XPU failures
- CUDA-only or NVIDIA-only branches were tested or explicitly labeled
- artifacts were preserved for every promoted claim
- final reporting is by family with pass/fail/blocked scope
- the conclusion does not overclaim repo-wide support

## Recommended final summary

The final handoff should contain:

1. package identity and commit tested
2. environment summary
3. registration summary
4. per-family result table
5. explicit XPU-supported families
6. explicit CPU-fallback families
7. explicit failed or blocked families with root causes
8. exact artifact locations for reproduction

This keeps custom-node migration claims at the right scope: **prove the families you tested, label the ones you did not, and never let a single green workflow stand in for the whole repo.**
