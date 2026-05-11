# Intel XPU workflow migration checklist

This is the **canonical reusable checklist** for deciding whether a workflow should stay on the normal ComfyUI-to-Intel-XPU migration path, fall back to CPU, switch to another runtime, or be treated as a feature-development task.

Use it with:

- `intel-xpu-workflow-migration-skill.md`
- `intel-xpu-workflow-review-prompt.md`
- `intel-xpu-workflow-release-standard.md`

Do **not** use this file as a case report for one workflow. Workflow-specific conclusions belong in the corresponding case docs or artifact bundle.

## 1. Output classes

Every workflow or node family should land in one of these buckets:

| Result | Meaning |
| --- | --- |
| **Intel-XPU migrated** | native XPU execution is retained with evidence |
| **CPU fallback** | useful delivery path exists, but meaningful compute stays on CPU |
| **environment / integration gap** | main blocker is packaging, codecs, providers, assets, or service wiring |
| **feature-development gap** | active runtime contract is still CUDA-shaped or architecture work is required |
| **capacity hard stop** | target fidelity exceeds the intended hardware budget even after reasonable mitigation |

## 2. Phase 0: quick routing before code changes

Do this before patching anything.

### 2.1 Confirm the real target

1. What is the primary execution target?
   - interactive ComfyUI workflow
   - API service
   - batch/offline production
2. What is the real hardware budget?
   - single XPU size
   - multi-XPU availability
   - allowed CPU offload
3. What is the fidelity target?
   - smoke / reduced-resource
   - production resolution / frame count
   - strict source-identical asset requirement

### 2.2 Fast rejection rules

If any of these are already true, do **not** keep treating the work as a normal “generic XPU migration”:

1. smallest practical precision still does not fit the target budget
2. real requirement is API serving / high concurrency / runtime LoRA switching, not GUI orchestration
3. active node/package contract still depends on `.cuda()`, `torch.cuda.*`, CUDA-only kernels, or CUDA-only providers
4. package does not install cleanly in the target Python/runtime without a workaround
5. the family already works well enough on CPU and native-XPU value is low

In those cases, route to:

- **CPU fallback**
- **environment / integration**
- **feature-development**
- or **non-ComfyUI runtime**

## 3. Phase 1: inventory and scope freeze

Before runtime work, capture:

1. workflow node count, links, outputs, and branch structure
2. model inventory from widgets and loader inputs
3. custom-node repository inventory
4. nested repos and ignored repos
5. workflow-side input assets such as images, masks, textures, videos
6. expected output nodes and output media types

Minimum questions:

- Are there widget-only or half-widget nodes that the API prompt converter must preserve?
- Are there selector-backed names that need basename normalization?
- Are there model aliases or proprietary assets that must be documented as unresolved?

## 4. Phase 2: prompt/export integrity

Before interpreting any runtime result, prove the prompt itself is complete.

### 4.1 Prompt conversion checks

1. literal nodes such as `Int`, `Float`, `String`, and similar widgets survive export
2. widget-heavy nodes such as `Prompt_Edit`, `LaoLi_Lineup`, `LoraLoaderModelOnly`, or package-specific control nodes preserve their required fields
3. selector-backed asset names are normalized to submit-safe values
4. raw `/prompt` validation response is captured
5. `node_errors` are reviewed before trusting `execution_success`
6. intended output node is still in the validated execution set and was not silently pruned

### 4.2 Asset-state labels

Use these terms consistently:

| Asset state | Meaning |
| --- | --- |
| **resolved and staged** | original source found and staged |
| **compatibility alias** | allows validation or smoke execution without proving source-identical fidelity |
| **unresolved source** | original requested asset is still missing |

## 5. Phase 3: source audit and patch class

Audit high-risk nodes and packages from source, not from guesses.

### 5.1 Scan for XPU risk

Look for:

- `torch.cuda.*`
- `.cuda()`
- hard-coded `"cuda"`
- CUDA-only extension build paths
- custom attention kernels
- unsupported provider assumptions
- memory cleanup APIs tied to CUDA
- eager imports with side effects

### 5.2 Classify the needed change

Each fix should be recorded as one of:

1. **workflow/runtime policy only**
   - safe widget value
   - CPU-biased placement
   - offload policy
2. **ComfyUI core patch**
3. **external custom-node patch**
4. **environment / dependency fix**
5. **not patchable as normal migration work**

## 6. Phase 4: runtime validation ladder

Always validate in this order:

1. install/import success
2. registration success
3. prompt validation success
4. branch smoke success
5. full-workflow smoke success
6. full-size / target-fidelity validation

Do not collapse these into one “works” label.

## 7. Phase 5: memory and capacity triage

This section absorbs the old standalone memory checklist.

### 7.1 Estimate before expensive runs

Record at least:

1. large model weights likely resident together
2. expected activation-heavy stage
3. whether the workflow is image-bound, decode-bound, or sampler-bound
4. whether CPU offload can realistically remove the real bottleneck

### 7.2 Generic decisions for 24 GB class XPU targets

| Estimated posture | Recommended action |
| --- | --- |
| comfortably below budget | normal ComfyUI path |
| near budget but plausible | keep ComfyUI, use measured placement/offload knobs |
| barely fits only with major compromise | smoke-only or restricted delivery tier |
| exceeds budget even after reasonable mitigation | capacity hard stop; escalate instead of retrying generic tweaks |

### 7.3 Capacity hard-stop rule

Treat the case as a **structural hardware limit**, not an ordinary tuning miss, when both are true:

1. runtime evidence shows `free + required > total budget`
2. theoretical active-weight plus activation math also exceeds the budget

At that point escalate to:

- multi-XPU
- activation-level model/runtime optimization
- smaller-generation-plus-postprocess tier
- or a different runtime/service architecture

## 8. Phase 6: delivery wording and review

### 8.1 Wording to use

Prefer:

- **migrated on Intel XPU with retained smoke**
- **delivered as CPU fallback**
- **blocked by CUDA-shaped runtime contract**
- **blocked by packaging/integration gap**
- **blocked by target hardware capacity**

Avoid vague phrases like:

- “not working yet”
- “needs more patching”
- “maybe fix later”

### 8.2 Final review questions

Before publication, answer:

1. Which executable nodes were actually covered?
2. Which branches only have smoke coverage?
3. Which assets are compatibility aliases rather than source-identical originals?
4. Which blockers are migration blockers vs capacity blockers vs environment blockers?
5. Is the document labeled as **generic method** or **case evidence** correctly?

## 9. Stop rules

Stop normal migration iteration and reclassify the work when:

1. the remaining blocker is backend/provider support outside the repo
2. the active path still requires CUDA-only architecture changes
3. the workflow only remains viable as CPU fallback
4. the target fidelity is beyond the hardware budget
5. the real requirement is not a ComfyUI workflow anymore

That is the point where the task changes from “workflow migration” to one of:

- delivery packaging
- feature development
- runtime/platform selection
- or hardware-capacity escalation
