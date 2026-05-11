# Intel XPU hardware reference worksheet

Use this worksheet in Step 1 feasibility, Step 5 environment deployment, and Step 8 full validation/capacity triage.

This file is intentionally conservative. It records what the migration evidence supports and leaves unknown hardware values blank until measured. Do not invent B60/B70 specs from environment names.

## Purpose

The migration flow uses `target hardware budget` and `usable VRAM`. Those values must come from measured hardware, driver/runtime reports, and retained telemetry.

## Hardware profiles from retained migration evidence

| Profile label | What is known from repo evidence | What is not proven here | How to use it |
| --- | --- | --- | --- |
| B60 single-XPU target | Dasiwa B60 report states a **single Intel B60 / 24 GB XPU budget**. Reduced-resource branch smoke succeeded; full-size branch `54` at `1024 x 1024 / 81 frames` exceeded the budget. | Exact public product SKU, exact usable VRAM after driver/runtime reserve, and dtype throughput are not established by the draft docs alone. | Use as the evidence-backed 24 GB-class capacity reference. Measure actual usable VRAM before applying the capacity matrix. |
| B70 validation environment | Dasiwa delivery artifacts use B70 as a validation/deployment phase label. The retained memory analysis still discusses a single-card 24 GiB constraint for the failing Wan geometry. | The draft docs do **not** prove that "B70" means a different GPU SKU, larger VRAM, or a validated higher capacity tier. | Treat B70 as an environment label until the environment report records actual GPU model, total VRAM, usable VRAM, driver, and runtime. |

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
