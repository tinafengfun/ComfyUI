#!/usr/bin/env python3
"""CLIP FP8 precision comparison: CPU native vs XPU dequantized.

Compares text-encoder embeddings from two code paths against the same FP8
checkpoint (qwen_2.5_vl_7b_fp8_scaled.safetensors):

  - CPU path  : load_device=cpu. comfy_kitchen MixedPrecisionOps dequantizes
                FP8 weights lazily during forward pass.
  - XPU path  : load_device=xpu. The comfy/ops.py patch in this directory
                (0001-xpu-fp8-fallback-dequantize-before-move-to-xpu.patch)
                dequantizes FP8 weights to bf16 UPFRONT, then bf16 weights
                live on XPU for the forward pass.

Both paths ultimately compute in bf16, so embeddings should align to a high
cosine similarity. Divergence comes from kernel-level differences
(oneDNN-AVX512 vs oneDNN-XPU/SYCL) and reduction-order nondeterminism.

Usage:
    /home/intel/tianfeng/comfy/ComfyUI/.venv-xpu/bin/python3 \\
        /home/intel/tianfeng/comfy/ComfyUI/xpu-bug-investigation/clip_fp8_precision_test.py

Options:
    --clip NAME            text encoder filename (default qwen_2.5_vl_7b_fp8_scaled.safetensors)
    --type TYPE            CLIPType recipe (default qwen_image)
    --prompts FILE         text file with one prompt per line (defaults built-in)
    --save PATH            npz output path (default /tmp/clip_fp8_precision.npz)
    --cosine-threshold F   min cosine to pass (default 0.999)
    --skip-cpu / --skip-xpu   run only one side (debug)
"""
from __future__ import annotations

import argparse
import os
import sys

COMFYUI_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, COMFYUI_ROOT)
os.chdir(COMFYUI_ROOT)

# Point ComfyUI's model search at /home/intel/hf_models BEFORE folder_paths reads it.
# text_encoders then resolves to /home/intel/hf_models/text_encoders/.
HF_MODELS = os.environ.get("MODEL_ROOTS", "/home/intel/hf_models")
os.environ.setdefault("COMFYUI_MODEL_PATH", HF_MODELS)

# Save real argv for our own argparse, then reset so comfy.cli_args doesn't
# choke on our --clip / --type / etc. flags.
REAL_ARGV = list(sys.argv[1:])
sys.argv = ["clip-fp8-precision-test"]

import numpy as np
import torch

import folder_paths
import comfy.sd
import comfy.model_management


DEFAULT_PROMPTS = [
    # Pull from the qwen2512-fp8-xpu-test workflow so the test reflects real usage.
    "There are thick bamboo forests here, light green leaves, blowing the fine wind, "
    "Jiangnan Garden, CG rendering, wide angle lens, volumetric light, 8K",
    "a quick brown fox jumps over the lazy dog",
    "低分辨率，低画质，肢体畸形，手指畸形，画面过饱和，蜡像感",
    "A serene mountain lake at dawn, mist rising from still water, pine trees",
    "cyberpunk city street at night, neon reflections, rain-slicked pavement",
]


def banner(msg: str) -> None:
    print("")
    print("=" * 100)
    print(msg)
    print("=" * 100)


def load_clip_on(device_str: str, clip_name: str, clip_type: str):
    """Load CLIP on a specific device via model_options override.

    Mirrors what CLIPLoader does in nodes.py for device='cpu' / 'gpu'.
    For xpu, this triggers the FP8-dequant-before-move patch path.
    """
    device = torch.device(device_str)
    model_options = {
        "load_device": device,
        "offload_device": device,  # pin so offload doesn't introduce extra moves
    }
    clip_path = folder_paths.get_full_path_or_raise("text_encoders", clip_name)
    print(f"  Loading {clip_name} from {clip_path}")
    print(f"  target device: {device}")
    clip_type_enum = getattr(comfy.sd.CLIPType, clip_type.upper(), comfy.sd.CLIPType.STABLE_DIFFUSION)
    clip = comfy.sd.load_clip(
        ckpt_paths=[clip_path],
        embedding_directory=folder_paths.get_folder_paths("embeddings"),
        clip_type=clip_type_enum,
        model_options=model_options,
    )
    return clip


def encode_prompt(clip, text: str):
    """Tokenize + encode, return (cond, pooled|None) as float32 CPU tensors.

    pooled is None for CLIP types that don't emit pooled output (e.g. qwen_image).
    """
    tokens = clip.tokenize(text)
    cond, pooled = clip.encode_from_tokens(tokens, return_pooled=True)
    cond = cond.detach().float().cpu()
    if pooled is None:
        return cond, None
    return cond, pooled.detach().float().cpu()


def compare(name: str, a: torch.Tensor, b: torch.Tensor) -> dict:
    """Return max_abs / mean_abs / cosine similarity between two tensors."""
    if a.shape != b.shape:
        return {
            "name": name,
            "shape_a": tuple(a.shape),
            "shape_b": tuple(b.shape),
            "max_abs": float("nan"),
            "mean_abs": float("nan"),
            "cosine": float("nan"),
            "shape_mismatch": True,
        }
    diff = (a - b).abs()
    flat_a = a.flatten().unsqueeze(0)
    flat_b = b.flatten().unsqueeze(0)
    cos = torch.nn.functional.cosine_similarity(flat_a, flat_b).item()
    return {
        "name": name,
        "shape": tuple(a.shape),
        "max_abs": diff.max().item(),
        "mean_abs": diff.mean().item(),
        "cosine": cos,
        "shape_mismatch": False,
    }


def fmt_row(label: str, shape, max_abs: float, mean_abs: float, cosine: float, width=40) -> str:
    return f"{label:<10} {str(shape):<18} {max_abs:>12.6f} {mean_abs:>14.8f} {cosine:>12.8f}"


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--clip", default="qwen_2.5_vl_7b_fp8_scaled.safetensors")
    parser.add_argument("--type", default="qwen_image",
                        help="CLIPType recipe name (qwen_image, wan, sd3, flux, ...)")
    parser.add_argument("--prompts", help="text file, one prompt per line")
    parser.add_argument("--save", default="/tmp/clip_fp8_precision.npz")
    parser.add_argument("--cosine-threshold", type=float, default=0.999)
    parser.add_argument("--skip-cpu", action="store_true")
    parser.add_argument("--skip-xpu", action="store_true")
    args = parser.parse_args(REAL_ARGV)

    if args.prompts:
        with open(args.prompts) as f:
            prompts = [line.strip() for line in f if line.strip()]
    else:
        prompts = DEFAULT_PROMPTS

    banner(f"CLIP FP8 precision test | model={args.clip} | type={args.type}")
    print(f"Prompts: {len(prompts)}")
    print(f"Pass threshold: cosine >= {args.cosine_threshold}")
    print(f"XPU available: {torch.xpu.is_available()}  device count: {torch.xpu.device_count()}")
    if torch.xpu.is_available():
        props = torch.xpu.get_device_properties(0)
        print(f"XPU[0]: {props.name}  has_fp16={props.has_fp16}")

    clip_cpu = None
    clip_xpu = None
    if not args.skip_cpu:
        banner("Loading CLIP on CPU (native FP8 → bf16 via MixedPrecisionOps)")
        clip_cpu = load_clip_on("cpu", args.clip, args.type)
    if not args.skip_xpu:
        banner("Loading CLIP on XPU (FP8 → bf16 upfront via ops.py patch)")
        clip_xpu = load_clip_on("xpu", args.clip, args.type)
        free, total = torch.xpu.mem_get_info(0) if torch.xpu.is_available() else (0, 0)
        print(f"  XPU memory after load: {(total-free)/1024**3:.2f} GB used / {total/1024**3:.2f} GB total")

    results = []
    npz_arrays = {"prompts": np.array(prompts)}
    banner(f"Encoding {len(prompts)} prompts on both devices")
    for i, prompt in enumerate(prompts, 1):
        preview = (prompt[:60] + "…") if len(prompt) > 60 else prompt
        print(f"\n[{i}/{len(prompts)}] {preview}")

        if clip_cpu is not None:
            c_cpu, p_cpu = encode_prompt(clip_cpu, prompt)
            npz_arrays[f"cond_cpu_{i:02d}"] = c_cpu.numpy()
            if p_cpu is not None:
                npz_arrays[f"pooled_cpu_{i:02d}"] = p_cpu.numpy()
        if clip_xpu is not None:
            c_xpu, p_xpu = encode_prompt(clip_xpu, prompt)
            npz_arrays[f"cond_xpu_{i:02d}"] = c_xpu.numpy()
            if p_xpu is not None:
                npz_arrays[f"pooled_xpu_{i:02d}"] = p_xpu.numpy()

        if clip_cpu is not None and clip_xpu is not None:
            cond_res = compare(f"cond[{i:02d}]", c_cpu, c_xpu)
            print("  " + fmt_row("cond", cond_res["shape"], cond_res["max_abs"], cond_res["mean_abs"], cond_res["cosine"]))
            if p_cpu is not None and p_xpu is not None:
                pool_res = compare(f"pooled[{i:02d}]", p_cpu, p_xpu)
                print("  " + fmt_row("pooled", pool_res["shape"], pool_res["max_abs"], pool_res["mean_abs"], pool_res["cosine"]))
                results.append((prompt, cond_res, pool_res))
            else:
                results.append((prompt, cond_res, None))

    # Save raw embeddings for follow-up
    os.makedirs(os.path.dirname(args.save) or ".", exist_ok=True)
    np.savez(args.save, **npz_arrays)
    print(f"\nSaved embeddings to {args.save}")

    # Summary
    if not results:
        banner("No comparison done (--skip-cpu or --skip-xpu was set)")
        return

    banner("Summary")
    header = f"{'output':<10} {'shape':<18} {'max_abs':>12} {'mean_abs':>14} {'cosine':>12}"
    print(header)
    print("-" * len(header))
    all_cosines = []
    for prompt, cond_res, pool_res in results:
        all_cosines.append(cond_res["cosine"])
        print(fmt_row("cond", cond_res["shape"], cond_res["max_abs"], cond_res["mean_abs"], cond_res["cosine"]))
        if pool_res is not None:
            all_cosines.append(pool_res["cosine"])
            print(fmt_row("pooled", pool_res["shape"], pool_res["max_abs"], pool_res["mean_abs"], pool_res["cosine"]))
        print()
    min_cos = min(all_cosines)
    print("-" * len(header))
    print(f"Min cosine across all outputs: {min_cos:.8f}")
    print(f"Threshold:                     {args.cosine_threshold}")
    if min_cos >= args.cosine_threshold:
        print(f"\nPASS: XPU dequant path aligns with CPU native (cosine >= {args.cosine_threshold})")
        sys.exit(0)
    else:
        print(f"\nFAIL: cosine < threshold — investigate divergence")
        print("Hints:")
        print("  - check comfy_kitchen version: pip show comfy_kitchen")
        print("  - check torch.xpu bf16 kernels vs CPU bf16 kernels")
        print("  - re-run with --save and inspect per-prompt diffs in numpy")
        sys.exit(1)


if __name__ == "__main__":
    main()
