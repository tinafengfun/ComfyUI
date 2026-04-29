# Mixlab next migration plan

This plan ranks the remaining Mixlab migration work by **compute demand**, **Intel XPU feasibility**, and **engineering effort**.

The goal is to avoid spending the next round on the hardest CUDA-bound families first when easier native-XPU wins are still available.

## Ranking axes

### 1. Compute demand

- **low**: helper/UI/image-processing or orchestration nodes
- **medium**: moderate model nodes with standard PyTorch/Transformers patterns
- **high**: heavy multimodal/audio/3D/background-removal stacks

### 2. Intel XPU feasibility

- **high**: no custom CUDA kernels, limited CUDA-only API use, likely recoverable with device cleanup
- **medium**: CPU fallback already works or source looks portable after non-trivial refactor
- **low**: hardcoded `.cuda()`, CUDA cleanup APIs, vendored import breakage, GPU-only package assumptions

### 3. Engineering effort

- **low**: packaging/import cleanup, dependency declaration cleanup, device-string cleanup
- **medium**: model loading and runtime-path cleanup, asset staging, family smoke creation
- **high**: architectural refactor, replacing CUDA-only logic, vendored package repair, or upstream-heavy porting

## Priority ranking

| Rank | Family group | Current status | Compute demand | XPU feasibility | Engineering effort | Why it belongs here |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | `ClipInterrogator`, `PromptGenerate_Mix`, `ChinesePrompt_Mix`, `LaMa` | `xpu-candidate` | medium | high | low-medium | best chance to convert current audit-only support into real native-XPU wins |
| A2 | prompt/UI/image/layer/mask/video-plumbing helper families | `xpu-candidate` | low | high | low | low-cost validation path with small runtime risk and fast evidence payback |
| B1 | `Whisper`, `SenseVoice` | `cpu-fallback` | medium | medium | medium | already useful on CPU; revisit only after easy XPU wins so promotion effort is justified |
| B2 | `TripoSR` | `cpu-fallback` | high | medium-low | medium-high | asset/runtime complexity is higher than other fallback families, so it should not lead the next XPU push |
| C1 | `MiniCPM` | `blocked` | high | low | high | device routing and CUDA cleanup both need repair before meaningful XPU testing |
| C2 | `Rembg` | `blocked` | medium-high | low | high | import-time `rembg[gpu]` behavior and BRIA `.cuda()` path make it a poor near-term target |
| C3 | `FishSpeech` | `blocked` | high | low | very high | vendored namespace/import problems come before XPU work, so this should be the last family revisited |

## Execution waves

### Wave A — low-cost native-XPU candidates

Target:

- `ClipInterrogator`
- `PromptGenerate_Mix`
- `ChinesePrompt_Mix`
- `LaMa`
- low-risk helper families already marked `xpu-candidate`

Goal:

- produce the first retained **native-XPU family runtime evidence**
- reduce the current gap where Mixlab has bootstrap success but zero native-XPU validated families

Expected work:

1. device-string cleanup
2. explicit dependency handling without import-time installs
3. representative family smoke creation
4. support-matrix promotion only after retained logs and outputs exist

### Wave B — CPU-fallback promotion review

Target:

- `Whisper`
- `SenseVoice`
- `TripoSR`

Goal:

- separate “keep as CPU fallback” from “worth porting to XPU next”

Expected work:

1. measure whether the heavy compute actually benefits from XPU in this environment
2. check whether missing XPU support is mostly device-routing cleanup or real operator/runtime gaps
3. keep CPU fallback as the shipped tier unless XPU wins are both feasible and worth the effort

### Wave C — blocked-family remediation

Target:

- `MiniCPM`
- `Rembg`
- `FishSpeech`

Goal:

- treat each as a separate engineering project instead of the default next step

Expected work:

1. remove import-time package side effects
2. replace or guard CUDA-only cleanup and placement logic
3. repair vendored import/dependency surfaces where needed
4. stop early if the work becomes upstream re-architecture instead of practical migration

## Decision rules

1. If a family mostly needs **dependency cleanup + device-string cleanup**, keep it in **Wave A**.
2. If a family already works on CPU and the missing XPU path looks like **runtime/operator validation**, keep it in **Wave B**.
3. If a family still depends on **`.cuda()` / `torch.cuda.*` / vendored import repair / GPU-only package assumptions**, keep it in **Wave C**.
4. Do not let blocked families consume the next migration round until at least one **Wave A native-XPU family** is promoted with retained evidence.

## Practical next step

If work starts immediately, the first concrete implementation pass should be:

1. `ClipInterrogator`
2. `PromptGenerate_Mix` / `ChinesePrompt_Mix`
3. `LaMa`
4. one representative low-risk helper family

That sequence gives the best balance of:

- lower compute cost
- better XPU feasibility
- lower engineering effort
- higher chance of producing the first honest native-XPU Mixlab support claims
