#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from collections import Counter
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import gguf
from safetensors import safe_open

from utils.prompt_subgraph import extract_prompt_subgraph


CATEGORY_PATHS = {
    "checkpoints": ["checkpoints"],
    "clip_vision": ["clip_vision"],
    "diffusion_models": ["diffusion_models", "unet"],
    "loras": ["loras"],
    "text_encoders": ["text_encoders", "clip"],
    "vae": ["vae", "vae_approx"],
}

MODEL_INPUTS = {
    "UNETLoader": [("unet_name", "diffusion_models", "unet")],
    "UnetLoaderGGUF": [("unet_name", "diffusion_models", "unet_gguf")],
    "UnetLoaderGGUFAdvanced": [("unet_name", "diffusion_models", "unet_gguf")],
    "CLIPLoader": [("clip_name", "text_encoders", "clip")],
    "DualCLIPLoader": [("clip_name1", "text_encoders", "clip"), ("clip_name2", "text_encoders", "clip")],
    "CLIPLoaderGGUF": [("clip_name", "text_encoders", "clip")],
    "DualCLIPLoaderGGUF": [("clip_name1", "text_encoders", "clip"), ("clip_name2", "text_encoders", "clip")],
    "VAELoader": [("vae_name", "vae", "vae")],
    "CLIPVisionLoader": [("clip_name", "clip_vision", "clip_vision")],
    "LoraLoader": [("lora_name", "loras", "lora")],
}

SPECIAL_VAE_NAMES = {"pixel_space", "taesd", "taesdxl", "taesd3", "taef1"}
DASHBOARD_NOTES = {
    "async_offload": {
        "implemented_for_xpu": True,
        "default_enabled_on_xpu": False,
        "non_blocking_default_on_xpu": False,
        "recommendation": "Use only as an explicit experiment on XPU. Upstream creates XPU streams, but device_supports_non_blocking() disables non_blocking on Intel XPU by default, so it should not replace CPU fallback for >24GB projections.",
        "source": [
            "comfy/cli_args.py --async-offload",
            "comfy/model_management.py get_offload_stream()",
            "comfy/model_management.py device_supports_non_blocking()",
        ],
    }
}

COMPUTE_INTENSITY = {
    "unet": "high",
    "unet_gguf": "high",
    "clip": "low",
    "vae": "medium",
    "clip_vision": "medium",
    "lora": "low",
}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Assess model parameters and projected XPU memory for a ComfyUI API prompt."
    )
    parser.add_argument("prompt_json", type=Path, help="Path to a ComfyUI API prompt JSON file.")
    parser.add_argument("--output-node", action="append", help="Optional output node id to assess. Can be passed multiple times.")
    parser.add_argument("--search-root", action="append", type=Path, default=[], help="Model root to search, for example /home/intel/hf_models.")
    parser.add_argument("--vram-limit-gb", type=float, default=24.0, help="XPU VRAM safety limit in GB.")
    parser.add_argument("--json", action="store_true", help="Print JSON only.")
    return parser


def load_prompt(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def is_link(value: Any) -> bool:
    return (
        isinstance(value, list)
        and len(value) == 2
        and isinstance(value[0], (str, int))
        and isinstance(value[1], int)
    )


def resolve_model_path(model_name: str, category: str, roots: list[Path]) -> str | None:
    candidate = Path(model_name)
    if candidate.is_absolute() and candidate.exists():
        return str(candidate)

    subdirs = CATEGORY_PATHS.get(category, [category])
    for root in roots:
        direct = root / model_name
        if direct.exists():
            return str(direct)
        for subdir in subdirs:
            full = root / subdir / model_name
            if full.exists():
                return str(full)
    return None


def dtype_bytes(dtype_name: str) -> int:
    sizes = {
        "BOOL": 1,
        "U8": 1,
        "I8": 1,
        "F8_E4M3": 1,
        "F8_E5M2": 1,
        "F8_E8M0": 1,
        "U16": 2,
        "I16": 2,
        "F16": 2,
        "BF16": 2,
        "U32": 4,
        "I32": 4,
        "F32": 4,
        "U64": 8,
        "I64": 8,
        "F64": 8,
    }
    return sizes.get(dtype_name, 2)


def runtime_bytes_for_dtype(dtype_name: str) -> int:
    return max(dtype_bytes(dtype_name), 2)


def recommend_device(role: str, projected_bytes: int | None, vram_limit_bytes: int) -> tuple[str, str, str]:
    compute_intensity = COMPUTE_INTENSITY.get(role, "low")
    if projected_bytes is None:
        return "cpu", compute_intensity, "model path unresolved, defaulting to CPU until inventory is fixed"

    if projected_bytes > vram_limit_bytes:
        return "cpu", compute_intensity, f"projected XPU weight memory {projected_bytes / (1024 ** 3):.2f} GB exceeds limit"

    if compute_intensity == "high":
        return "xpu", compute_intensity, "high compute intensity and fits under the XPU VRAM limit"

    if compute_intensity == "medium":
        if projected_bytes <= vram_limit_bytes * 0.20:
            return "xpu", compute_intensity, "medium compute intensity and light enough to keep on XPU"
        return "cpu", compute_intensity, "medium compute intensity but better left on CPU/offload to preserve XPU memory for UNet sampling"

    return "cpu", compute_intensity, "low compute intensity, keep XPU budget for more compute-dense stages"


def assess_safetensors(path: str) -> dict[str, Any]:
    params = 0
    storage_bytes = 0
    projected_xpu_bytes = 0
    dtypes = Counter()
    with safe_open(path, framework="pt", device="cpu") as handle:
        for key in handle.keys():
            tensor = handle.get_slice(key)
            shape = tensor.get_shape()
            dtype_name = str(tensor.get_dtype())
            numel = math.prod(shape)
            params += numel
            storage_bytes += numel * dtype_bytes(dtype_name)
            projected_xpu_bytes += numel * runtime_bytes_for_dtype(dtype_name)
            dtypes[dtype_name] += 1
    return {
        "format": "safetensors",
        "params": params,
        "storage_bytes": storage_bytes,
        "projected_xpu_weight_bytes": projected_xpu_bytes,
        "quantization": dict(dtypes),
    }


def assess_gguf(path: str) -> dict[str, Any]:
    reader = gguf.GGUFReader(path)
    params = 0
    projected_xpu_bytes = 0
    qtypes = Counter()
    for tensor in reader.tensors:
        numel = math.prod(tensor.shape)
        params += numel
        qname = getattr(tensor.tensor_type, "name", str(tensor.tensor_type))
        qtypes[qname] += 1
        projected_xpu_bytes += numel * (4 if qname == "F32" else 2)
    return {
        "format": "gguf",
        "params": params,
        "storage_bytes": os.path.getsize(path),
        "projected_xpu_weight_bytes": projected_xpu_bytes,
        "quantization": dict(qtypes),
    }


def assess_file(path: str) -> dict[str, Any]:
    suffix = Path(path).suffix.lower()
    if suffix == ".safetensors":
        result = assess_safetensors(path)
    elif suffix == ".gguf":
        result = assess_gguf(path)
    else:
        size = os.path.getsize(path)
        result = {
            "format": suffix.lstrip(".") or "unknown",
            "params": None,
            "storage_bytes": size,
            "projected_xpu_weight_bytes": size,
            "quantization": {},
        }
    result["path"] = path
    result["file_bytes"] = os.path.getsize(path)
    return result


def collect_prompt_models(prompt: dict[str, Any], search_roots: list[Path]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for node_id, node in prompt.items():
        class_type = node.get("class_type")
        inputs = node.get("inputs", {})

        for input_name, category, role in MODEL_INPUTS.get(class_type, []):
            if input_name not in inputs:
                continue
            model_name = inputs[input_name]
            if class_type == "VAELoader" and model_name in SPECIAL_VAE_NAMES:
                records.append(
                    {
                        "node_id": node_id,
                        "class_type": class_type,
                        "role": role,
                        "model_name": model_name,
                        "path": None,
                        "special_case": True,
                        "assessment": None,
                    }
                )
                continue
            path = resolve_model_path(model_name, category, search_roots)
            records.append(
                {
                    "node_id": node_id,
                    "class_type": class_type,
                    "role": role,
                    "model_name": model_name,
                    "path": path,
                    "special_case": False,
                    "assessment": assess_file(path) if path else None,
                }
            )

        if class_type == "Power Lora Loader (rgthree)":
            for name, value in inputs.items():
                if not name.startswith("lora_") or not isinstance(value, dict):
                    continue
                model_name = value.get("lora")
                if not model_name or model_name == "None":
                    continue
                path = resolve_model_path(model_name, "loras", search_roots)
                records.append(
                    {
                        "node_id": node_id,
                        "class_type": class_type,
                        "role": "lora",
                        "model_name": model_name,
                        "path": path,
                        "special_case": False,
                        "assessment": assess_file(path) if path else None,
                    }
                )

    return records


def summarize(records: list[dict[str, Any]], vram_limit_bytes: int) -> dict[str, Any]:
    total_projected = 0
    missing = []
    models = []
    xpu_preferred = []
    cpu_preferred = []
    for record in records:
        assessment = record["assessment"]
        if record["special_case"]:
            recommended_device, compute_intensity, reason = ("cpu", COMPUTE_INTENSITY.get(record["role"], "low"), "virtual VAE entry")
            models.append(
                {
                    **record,
                    "compute_intensity": compute_intensity,
                    "recommended_device": recommended_device,
                    "cpu_recommended": False,
                    "reason": reason,
                }
            )
            cpu_preferred.append(record["node_id"])
            continue
        if assessment is None:
            missing.append(record["model_name"])
            recommended_device, compute_intensity, reason = recommend_device(record["role"], None, vram_limit_bytes)
            models.append(
                {
                    **record,
                    "compute_intensity": compute_intensity,
                    "recommended_device": recommended_device,
                    "cpu_recommended": True,
                    "reason": reason,
                }
            )
            cpu_preferred.append(record["node_id"])
            continue

        projected = assessment["projected_xpu_weight_bytes"]
        total_projected += projected
        recommended_device, compute_intensity, reason = recommend_device(record["role"], projected, vram_limit_bytes)
        cpu_recommended = recommended_device == "cpu"

        models.append(
            {
                **record,
                "assessment": assessment,
                "compute_intensity": compute_intensity,
                "recommended_device": recommended_device,
                "cpu_recommended": cpu_recommended,
                "reason": reason,
            }
        )
        if recommended_device == "xpu":
            xpu_preferred.append(record["node_id"])
        else:
            cpu_preferred.append(record["node_id"])

    aggregate_cpu_recommended = total_projected > vram_limit_bytes
    return {
        "vram_limit_gb": vram_limit_bytes / (1024 ** 3),
        "projected_total_xpu_weight_gb": total_projected / (1024 ** 3),
        "aggregate_cpu_recommended": aggregate_cpu_recommended,
        "aggregate_reason": (
            f"Combined projected XPU weight memory {total_projected / (1024 ** 3):.2f} GB exceeds limit"
            if aggregate_cpu_recommended
            else None
        ),
        "placement_summary": {
            "xpu_preferred_node_ids": sorted(set(xpu_preferred), key=int),
            "cpu_preferred_node_ids": sorted(set(cpu_preferred), key=int),
            "policy": "Keep compute-dense models such as UNets on XPU when they fit under the VRAM limit; place lower-compute or over-budget models on CPU/offload.",
        },
        "missing_models": sorted(set(missing)),
        "models": models,
        "xpu_async_offload": DASHBOARD_NOTES["async_offload"],
    }


def default_search_roots() -> list[Path]:
    return [
        Path("/home/intel/tianfeng/comfy/ComfyUI/models"),
        Path("/tmp/hf_models"),
        Path("/home/intel/hf_models"),
    ]


def main() -> int:
    args = build_parser().parse_args()
    prompt = load_prompt(args.prompt_json)
    if args.output_node:
        prompt = extract_prompt_subgraph(prompt, args.output_node)

    search_roots = default_search_roots()
    for root in args.search_root:
        if root not in search_roots:
            search_roots.append(root)

    records = collect_prompt_models(prompt, search_roots)
    report = summarize(records, int(args.vram_limit_gb * (1024 ** 3)))

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0

    print(f"projected_total_xpu_weight_gb={report['projected_total_xpu_weight_gb']:.2f}")
    print(f"aggregate_cpu_recommended={report['aggregate_cpu_recommended']}")
    if report["aggregate_reason"]:
        print(f"aggregate_reason={report['aggregate_reason']}")
    for model in report["models"]:
        assessment = model.get("assessment")
        if assessment is None:
            projected_gb = "-"
        else:
            projected_gb = f"{assessment['projected_xpu_weight_bytes'] / (1024 ** 3):.2f}"
        print(
            f"{model['node_id']}\t{model['class_type']}\t{model['model_name']}\tprojected_xpu_gb={projected_gb}\tcompute={model['compute_intensity']}\trecommended_device={model['recommended_device']}"
        )
        if model["reason"]:
            print(f"  reason={model['reason']}")
    print("xpu_preferred_node_ids=" + ",".join(report["placement_summary"]["xpu_preferred_node_ids"]))
    print("cpu_preferred_node_ids=" + ",".join(report["placement_summary"]["cpu_preferred_node_ids"]))
    print("async_offload_note=" + report["xpu_async_offload"]["recommendation"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
