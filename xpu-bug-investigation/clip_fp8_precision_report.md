# CLIP FP8 Precision Test Report

**Date**: 2026-06-19
**Patch under test**: `0001-xpu-fp8-fallback-dequantize-before-move-to-xpu.patch`
**Test script**: `clip_fp8_precision_test.py`
**Run log**: `clip_fp8_precision_run.log`
**Verdict**: **PASS** — XPU dequant path aligns with CPU native FP8 path (min cosine 0.99998)

## Objective

Confirm that the `comfy/ops.py` patch — which dequantizes FP8 quantized tensors to
bf16 *before* moving them to XPU — produces CLIP text-encoder embeddings that are
numerically aligned with the CPU-native FP8 path (where `comfy_kitchen`'s
`MixedPrecisionOps` dequantizes lazily during the forward pass).

If the two paths align to high cosine similarity, the patch is safe to ship: XPU
users get the same prompt conditioning they would have gotten on CPU, without the
prior segfault workaround (CLIPLoader `device=cpu`).

## Patch summary

`comfy/ops.py::_quantized_apply` — before moving a module's parameters via `fn`
(usually `Module.to(device)`), the patched code:

1. Probes `fn` with an empty FP32 tensor on the parameter's current device to
   infer the *target* device.
2. If the target is `xpu` and the parameter is an FP8 `QuantizedTensor`, it calls
   `param.dequantize()`, casts to `torch.bfloat16`, then applies `fn` to the
   dense tensor — instead of letting the FP8 quantized tensor go through
   `clone()` on XPU (which segfaults in `comfy_kitchen`'s QTensor impl).
3. Same handling for buffers.
4. Emits a one-time `logging.warning("XPU FP8 fallback: …")` so the fallback
   path is observable in the server log.

The CPU path is unchanged — FP8 weights still flow through `MixedPrecisionOps`
during forward.

## Test methodology

`clip_fp8_precision_test.py` loads `qwen_2.5_vl_7b_fp8_scaled.safetensors` twice
via `comfy.sd.load_clip` with `model_options` pinning `load_device` and
`offload_device`:

| Instance | load_device | offload_device | FP8 handling |
|---|---|---|---|
| `clip_cpu` | `cpu` | `cpu` | `MixedPrecisionOps` (lazy dequant in forward) |
| `clip_xpu` | `xpu` | `xpu` | Patch in `comfy/ops.py` (upfront dequant to bf16) |

Each prompt is tokenized **once** (tokenization is CPU-only and identical for
both instances) and encoded on both devices. The resulting `cond` tensor is moved
to CPU as `float32` for comparison. qwen_image's CLIPType emits no pooled output,
so only `cond` is compared.

Metrics per prompt:

- **max_abs** — `max(|a − b|)`, worst single-element deviation
- **mean_abs** — `mean(|a − b|)`, average deviation
- **cosine** — `cosine_similarity(flatten(a), flatten(b))`, direction alignment

Pass criterion: cosine ≥ 0.999 across all prompt `cond` outputs.

## Environment

- **CPU**: Intel Xeon (host)
- **XPU**: Intel(R) Graphics [0xe211], `has_fp16=True`, 22.71 GB total VRAM
- **Python**: 3.13.3
- **torch**: 2.12.1+xpu
- **comfy_kitchen**: 0.1.0
- **ComfyUI**: branch `v2-agent`, patch applied to working tree

## Results

`cond` shape is `(1, T, 3584)` where `T` is the token count after tokenization.

| # | Prompt (truncated) | Tokens | Max abs | Mean abs | Cosine |
|---|---|---|---|---|---|
| 1 | There are thick bamboo forests here, light green leaves, blowing… (workflow's positive) | 39 | 0.7065 | 0.01618 | **0.99998975** |
| 2 | a quick brown fox jumps over the lazy dog | 14 | 0.7594 | 0.02049 | **0.99997985** |
| 3 | 低分辨率，低画质，肢体畸形… (workflow's negative) | 25 | 1.5581 | 0.01894 | **0.99998176** |
| 4 | A serene mountain lake at dawn, mist rising from still water… | 20 | 2.1067 | 0.01842 | **0.99998105** |
| 5 | cyberpunk city street at night, neon reflections… | 21 | 0.8418 | 0.01692 | **0.99998689** |

- **Min cosine across all outputs**: 0.99997985
- **Pass threshold**: 0.999
- **Result**: **PASS**

The non-zero `max_abs` values (up to ~2.1) are expected. They reflect kernel-level
differences between oneDNN's AVX-512 bf16 kernels on CPU and oneDNN's SYCL/XPU
bf16 kernels — different reduction orders and accumulation strategies produce
bit-level differences in matmul outputs that propagate through the transformer.
Cosine similarity at 0.99998 means the embeddings point in essentially the same
direction in 3584-D space, which is what matters for downstream KSampler
conditioning.

## Cross-checks performed during the test run

1. **Patch triggered on XPU load** — log line:
   `WARNING:root:XPU FP8 fallback: dequantizing FP8 quantized tensor to bf16 before moving to XPU.`
   fires once per process during `clip_xpu` load.
2. **XPU memory after CLIP load**: 21.41 GB / 22.71 GB used — consistent with
   ~14 GB bf16 weights (qwen_2.5_vl_7b FP8 → bf16 dequant) plus transformer
   activation buffers.
3. **No segfault**, no fallback to CPU, no exception. Both encoding paths
   completed for all 5 prompts.

## Combined patch-validation status

| Check | Source | Result |
|---|---|---|
| Patch applies cleanly to `comfy/ops.py` | `git diff comfy/ops.py` matches patch file | ✓ |
| Patch triggers when CLIP FP8 → XPU | Log warning observed | ✓ |
| No crash on XPU (the original bug) | GUI workflow ran end-to-end; precision test ran clean | ✓ |
| End-to-end image generation works | User-confirmed GUI run on `qwen2512-fp8-xpu-test.json` | ✓ |
| Precision vs CPU native FP8 | This test, min cosine 0.99997985 | ✓ |

The patch is **safe to ship**.

## How to reproduce

```bash
# From the ComfyUI root
cd /home/intel/tianfeng/comfy/ComfyUI

# Run the precision test (loads CLIP on CPU + XPU, ~1-2 minutes)
.venv-xpu/bin/python3 xpu-bug-investigation/clip_fp8_precision_test.py
```

Options:
- `--cosine-threshold 0.9999` — tighten the pass bar
- `--prompts my_prompts.txt` — one prompt per line
- `--type wan|sd3|flux` — test a different CLIPType recipe
- `--save /path/to/output.npz` — raw embeddings for offline analysis
- `--skip-cpu` / `--skip-xpu` — debug one side only

## Files

- `0001-xpu-fp8-fallback-dequantize-before-move-to-xpu.patch` — the patch
- `clip_fp8_precision_test.py` — this test
- `clip_fp8_precision_run.log` — captured stdout from the run reported above
- `clip_fp8_precision_report.md` — this document

## Notes / follow-ups

- The CLIPLoader `gpu` widget option added to `nodes.py` (separate change in the
  working tree, not part of this patch) makes it possible to force CLIP onto XPU
  under `--cpu` launch mode. Useful for OOM-constrained setups; not required for
  the patch itself.
- If a future `comfy_kitchen` release fixes the QTensor `.clone()` segfault on
  XPU directly, this patch becomes unnecessary and can be reverted — re-run
  this test to confirm parity before removing it.
