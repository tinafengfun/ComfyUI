# Intel XPU hardware reference worksheet

Use this worksheet in Step 1 feasibility, Step 5 environment deployment, and Step 8 full validation/capacity triage.

This file is intentionally conservative. It separates public planning references, project environment labels, and measured migration evidence. Do not invent B60/B70 specs from environment names.

## Purpose

The migration flow uses `target hardware budget` and `usable VRAM`. Those values must come from measured hardware, driver/runtime reports, and retained telemetry.

## Hardware profiles from retained migration evidence

| Profile label | What is known from repo evidence | What is not proven here | How to use it |
| --- | --- | --- | --- |
| B60 single-XPU target | Dasiwa B60 report states a **single Intel B60 / 24 GB XPU budget**. Reduced-resource branch smoke succeeded; full-size branch `54` at `1024 x 1024 / 81 frames` exceeded the budget. | Exact public product SKU, exact usable VRAM after driver/runtime reserve, and dtype throughput are not established by the draft docs alone. | Use as the evidence-backed 24 GB-class capacity reference. Measure actual usable VRAM before applying the capacity matrix. |
| Original remote 32 GB XPU host | The original remote tuning annex records Intel XPU with **~32 GB visible VRAM** and a completed conservative full baseline for the earlier remote host. | This does not prove an official Intel product name, a B70 SKU, or the usable VRAM on every later B70-labeled environment. | Use as evidence that a 32 GB-class XPU host existed in prior tuning work; still measure each target host. |
| B70 validation environment | Dasiwa delivery artifacts use B70 as a validation/deployment phase label. Current project guidance treats B70 as a **32 GB-class** target, but retained docs do not yet contain a direct hardware inventory proving the exact GPU model and usable VRAM. | The draft docs do **not** prove that "B70" is an official Intel product name or that every B70-labeled host has identical usable VRAM. | Treat B70 as a project environment label with expected 32 GB-class memory until `05-environment.md` records actual GPU model, total VRAM, usable VRAM, driver, and runtime. |

## Public planning references

Use public specifications only for early platform screening. They do **not** replace the measured fields below.

| Reference class | Public/planning value | Source type | How to use |
| --- | --- | --- | --- |
| Intel Arc desktop GPUs | Public Arc SKUs commonly publish fixed board-memory sizes such as 8 GB, 12 GB, or 16 GB depending on model. | Intel ARK / vendor product page | Useful for ruling out workflows whose estimate obviously exceeds board memory. Confirm exact SKU before routing. |
| Intel Data Center GPU Flex / Max families | Public data-center SKUs can expose different memory sizes and runtime behavior from Arc desktop cards. | Intel product brief / platform inventory | Use for platform planning only; validate PyTorch/IPEX/driver behavior on the actual host. |
| Project B60 label | Evidence-backed as a 24 GB-class target in this migration repo. | Retained Dasiwa B60 report | Use as local project shorthand only after confirming the actual target. |
| Project B70 label | Current project guidance expects 32 GB-class memory; original remote annex separately records a ~32 GB XPU host. | Project guidance plus retained remote tuning annex | Treat as expected target class, not as official SKU proof. Fill actual GPU inventory before capacity decisions. |

Public spec and project labels are only planning inputs. The capacity gate must use measured usable VRAM.

## Environment label mapping

Use this table to turn project labels such as `B60`, `B70`, or `remote-32g` into measured hardware facts.

| Environment label | Expected planning class | Required confirmation before capacity decision | Status wording to use |
| --- | --- | --- | --- |
| `B60` | 24 GB-class, based on retained Dasiwa B60 evidence | actual GPU model, total memory, usable VRAM, driver/runtime, ComfyUI launch profile | "B60-labeled 24 GB-class target, measured as ..." |
| `B70` | 32 GB-class, based on current project guidance | actual GPU model, total memory, usable VRAM, driver/runtime, ComfyUI launch profile | "B70-labeled 32 GB-class target, measured as ..." |
| `original remote` / `remote-32g` | ~32 GB visible VRAM, based on retained tuning annex | actual host identity, GPU model, total/usable VRAM, whether this is the same host as the new target | "remote 32 GB-class XPU host, measured as ..." |
| any new label | unknown | full hardware inventory | "unclassified Intel XPU target until measured" |

Do not write "B70 passed" or "B60 failed" as a hardware conclusion unless the report also states the measured GPU, usable VRAM, workflow geometry, and validation level.

## Platform screening flow

Use this before reserving a machine for a long migration run:

1. Estimate workflow peak with the feasibility skill.
2. Pick a planning class:
   - `< 16 GB`: small image workflows or small smoke tests may be plausible on smaller Arc-class devices.
   - `16-24 GB`: use a 24 GB-class target only if the estimate is comfortably below budget or the run is reduced-resource.
   - `24-32 GB`: prefer a 32 GB-class target, but still require telemetry because runtime scratch and fragmentation can exceed visible memory.
   - `> 32 GB`: do not assume a single 32 GB-class XPU is enough; consider multi-XPU, reduced fidelity, or activation-level engineering.
3. Confirm actual hardware using the required fields below.
4. Run Step 6 prompt validation before treating any runtime failure as a hardware limitation.
5. Run Step 7 branch smoke before spending time on full/high-fidelity execution.
6. Use Step 8 to classify the final capacity result.

This is a routing aid, not a success guarantee. Dasiwa showed that reduced-resource Wan smoke can pass while full-size Wan geometry still exceeds a 24 GB-class single-XPU budget.

## Required hardware fields

Fill this table from the actual target machine.

| Field | Value | Evidence command / source |
| --- | --- | --- |
| Host or environment label | | deployment notes |
| GPU model | | `xpu-smi`, `sycl-ls`, `lspci`, or platform inventory |
| Total VRAM | | `torch.xpu.get_device_properties(0).total_memory` or driver tool |
| Measured usable VRAM before ComfyUI run | | runtime telemetry |
| Minimum free VRAM before sampler | | ComfyUI memory debug or telemetry |
| Driver version | | driver package or `xpu-smi` |
| Level Zero / oneAPI runtime | | package manager or runtime report |
| PyTorch version and XPU availability | | `python -c "import torch; print(torch.__version__); print(torch.xpu.is_available())"` |
| IPEX version, if used | | `python -c "import intel_extension_for_pytorch as ipex; print(ipex.__version__)"` |
| Tested ComfyUI commit | | `git rev-parse HEAD` |

The resulting `05-environment.md` should include this sentence:

```text
Environment label `<label>` has been resolved to `<actual GPU model>` with `<total VRAM>` total and `<measured usable VRAM>` usable under `<driver/runtime>` for this validation run.
```

If that sentence cannot be filled truthfully, the environment remains an **environment / integration gap** for capacity decisions.

## Capacity routing worksheet

Use measured usable VRAM as the denominator in the flow's capacity decision matrix.

| Workflow type | Typical risk | 24 GB-class single XPU route based on retained evidence |
| --- | --- | --- |
| Small SD/SDXL image workflow | weights and activations usually lower than Wan video | Plausible, still validate prompt and branch smoke. |
| SDXL plus several ControlNet/LoRA stages | static residency can become tight | Plausible with telemetry and placement policy. |
| Wan video reduced-resource smoke | activation-heavy but smaller geometry | Plausible; Dasiwa reduced-resource branch smoke succeeded on B60/XPU. |
| Wan video full-size `1024 / 81-frame` Dasiwa-style branch | activation peak dominates | Capacity hard-stop risk on 24 GB-class single XPU; Dasiwa evidence exceeded budget. |
| Package-level custom-node validation | depends on family | Classify per family; do not infer repo-wide support from import success. |

## How to collect usable VRAM evidence

Use whichever commands are available on the target machine:

```bash
xpu-smi discovery
xpu-smi stats -d 0 -j
python - <<'PY'
import torch
print(torch.__version__)
print(torch.xpu.is_available())
if torch.xpu.is_available():
    props = torch.xpu.get_device_properties(0)
    print(props)
    print("total_memory", props.total_memory)
PY
```

If the machine uses a different Intel telemetry tool, record the exact command and output path in the environment report.

## Known Dasiwa capacity lesson

Dasiwa full-size branch `54` on the retained B60 / 24 GB-class target failed inside the first Wan denoise path. The important evidence was:

1. prompt and branch smoke were already validated
2. failure reached `KSamplerAdvanced` / Wan `apply_model`
3. runtime memory showed insufficient headroom
4. static activation reasoning independently crossed the 24 GB-class budget
5. generic lowvram and simple attention override did not unblock full-size execution

Therefore the correct reusable rule is not "Wan cannot run on Intel XPU". The correct rule is: **full-size Wan video geometry must be routed by measured capacity, and reduced-resource smoke must not be reported as full-size success**.
