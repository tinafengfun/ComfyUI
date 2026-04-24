#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


CATEGORY_PATHS = {
    "checkpoints": ["checkpoints"],
    "clip_vision": ["clip_vision"],
    "diffusion_models": ["diffusion_models", "unet"],
    "loras": ["loras"],
    "text_encoders": ["text_encoders", "clip"],
    "vae": ["vae", "vae_approx"],
}

SPECIAL_VAE_NAMES = {"pixel_space", "taesd", "taesdxl", "taesd3", "taef1"}

CUSTOM_NODE_MANIFEST = {
    "ComfyLiterals": {
        "dir_name": "ComfyLiterals",
        "repo_url": "https://github.com/M1kep/ComfyLiterals.git",
    },
    "comfyui-custom-scripts": {
        "dir_name": "ComfyUI-Custom-Scripts",
        "repo_url": "https://github.com/pythongosssss/ComfyUI-Custom-Scripts.git",
    },
    "comfyui-easy-use": {
        "dir_name": "ComfyUI-Easy-Use",
        "repo_url": "https://github.com/yolain/ComfyUI-Easy-Use.git",
    },
    "comfyui-frame-interpolation": {
        "dir_name": "ComfyUI-Frame-Interpolation",
        "repo_url": "https://github.com/Fannovel16/ComfyUI-Frame-Interpolation.git",
    },
    "ComfyUI-GGUF": {
        "dir_name": "ComfyUI-GGUF",
        "repo_url": "https://github.com/city96/ComfyUI-GGUF.git",
    },
    "ComfyUI-LaoLi-lineup": {
        "dir_name": "ComfyUI-LaoLi-lineup",
        "repo_url": "https://github.com/Laolilzp/ComfyUI-LaoLi-lineup.git",
    },
    "comfyui-kjnodes": {
        "dir_name": "ComfyUI-KJNodes",
        "repo_url": "https://github.com/kijai/ComfyUI-KJNodes.git",
    },
    "ComfyUI-PainterNodes": {
        "dir_name": "ComfyUI-PainterNodes",
        "repo_url": "https://github.com/princepainter/ComfyUI-PainterNodes.git",
    },
    "comfyui-videohelpersuite": {
        "dir_name": "ComfyUI-VideoHelperSuite",
        "repo_url": "https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git",
    },
    "comfyui_essentials": {
        "dir_name": "ComfyUI_essentials",
        "repo_url": "https://github.com/cubiq/ComfyUI_essentials.git",
    },
    "comfyui_layerstyle": {
        "dir_name": "ComfyUI_LayerStyle",
        "repo_url": "https://github.com/chflame163/ComfyUI_LayerStyle.git",
    },
    "ComfyUI_Qwen3-VL-Instruct": {
        "dir_name": "ComfyUI_Qwen3-VL-Instruct",
        "repo_url": "https://github.com/IuvenisSapiens/ComfyUI_Qwen3-VL-Instruct.git",
    },
    "ComfyUI-Wan22FMLF": {
        "dir_name": "ComfyUI-Wan22FMLF",
        "repo_url": "https://github.com/wallen0322/ComfyUI-Wan22FMLF.git",
    },
    "Comfyui-Memory_Cleanup": {
        "dir_name": "Comfyui-Memory_Cleanup",
        "repo_url": "https://github.com/LAOGOU-666/Comfyui-Memory_Cleanup.git",
    },
    "Comfyui_Prompt_Edit": {
        "dir_name": "Comfyui_Prompt_Edit",
        "repo_url": "https://github.com/xuchenxu168/Comfyui_Prompt_Edit.git",
    },
    "rgthree-comfy": {
        "dir_name": "rgthree-comfy",
        "repo_url": "https://github.com/rgthree/rgthree-comfy.git",
    },
}

CLASS_TYPE_FALLBACKS = {
    "Fast Groups Bypasser (rgthree)": "rgthree-comfy",
    "Power Lora Loader (rgthree)": "rgthree-comfy",
    "LaoLi_Lineup": "ComfyUI-LaoLi-lineup",
    "PainterI2V": "ComfyUI-PainterNodes",
    "Prompt_Edit": "Comfyui_Prompt_Edit",
    "Qwen3_VQA": "ComfyUI_Qwen3-VL-Instruct",
    "RAMCleanup": "Comfyui-Memory_Cleanup",
    "VRAMCleanup": "Comfyui-Memory_Cleanup",
    "WanMultiFrameRefToVideo": "ComfyUI-Wan22FMLF",
}

PROMPT_MODEL_INPUTS = {
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
    "LoraLoaderModelOnly": [("lora_name", "loras", "lora")],
}

WORKFLOW_MODEL_WIDGETS = {
    "UNETLoader": [("unet_name", 0, "diffusion_models", "unet")],
    "UnetLoaderGGUF": [("unet_name", 0, "diffusion_models", "unet_gguf")],
    "CLIPLoader": [("clip_name", 0, "text_encoders", "clip")],
    "VAELoader": [("vae_name", 0, "vae", "vae")],
    "CLIPVisionLoader": [("clip_name", 0, "clip_vision", "clip_vision")],
    "LoraLoaderModelOnly": [("lora_name", 0, "loras", "lora")],
}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Inventory custom nodes and model assets required by a ComfyUI workflow or API prompt."
    )
    parser.add_argument("json_path", type=Path, help="Workflow JSON or ComfyUI API prompt JSON.")
    parser.add_argument("--search-root", action="append", type=Path, default=[], help="Optional model root to search.")
    parser.add_argument("--json", action="store_true", help="Print JSON only.")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit non-zero when custom-node mapping is unknown or referenced models are missing.",
    )
    return parser


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def detect_format(data: dict[str, Any]) -> str:
    if isinstance(data.get("nodes"), list):
        return "workflow"
    return "prompt"


def normalize_model_name(model_name: str) -> str:
    return model_name.replace("\\", "/")


def resolve_model_path(model_name: str, category: str, roots: list[Path]) -> str | None:
    normalized = Path(normalize_model_name(model_name))
    if normalized.is_absolute() and normalized.exists():
        return str(normalized)

    subdirs = CATEGORY_PATHS.get(category, [category])
    for root in roots:
        direct = root / normalized
        if direct.exists():
            return str(direct)
        basename = root / normalized.name
        if basename.exists():
            return str(basename)
        for subdir in subdirs:
            full = root / subdir / normalized
            if full.exists():
                return str(full)
            nested_basename = root / subdir / normalized.name
            if nested_basename.exists():
                return str(nested_basename)
    return None


def workflow_widget_values(node: dict[str, Any], specs: list[tuple[str, int]] | None = None) -> dict[str, Any]:
    values = list(node.get("widgets_values") or [])
    if specs is not None:
        result: dict[str, Any] = {}
        for input_name, value_index in specs:
            if value_index >= len(values):
                continue
            value = values[value_index]
            if isinstance(value, dict):
                continue
            result[input_name] = value
        return result

    widget_inputs = [item for item in node.get("inputs", []) if isinstance(item, dict) and item.get("widget")]
    result: dict[str, Any] = {}
    value_index = 0
    for item in widget_inputs:
        if value_index >= len(values):
            break
        value = values[value_index]
        if isinstance(value, dict):
            break
        result[item["name"]] = value
        value_index += 1
    return result


def classify_custom_node(cnr_id: str | None, class_type: str) -> str | None:
    if cnr_id and cnr_id not in {"comfy-core", "unknown"}:
        return cnr_id
    return CLASS_TYPE_FALLBACKS.get(class_type)


def collect_custom_nodes(data: dict[str, Any], format_name: str) -> list[dict[str, Any]]:
    records: dict[str, dict[str, Any]] = {}
    if format_name == "workflow":
        iterable = (
            (str(node.get("id")), node.get("type"), node.get("properties", {}).get("cnr_id"))
            for node in data["nodes"]
        )
    else:
        iterable = (
            (str(node_id), node.get("class_type"), None)
            for node_id, node in data.items()
        )

    for node_id, class_type, cnr_id in iterable:
        package_id = classify_custom_node(cnr_id, class_type)
        if not package_id:
            continue
        entry = records.setdefault(
            package_id,
            {
                "package_id": package_id,
                "dir_name": CUSTOM_NODE_MANIFEST.get(package_id, {}).get("dir_name"),
                "repo_url": CUSTOM_NODE_MANIFEST.get(package_id, {}).get("repo_url"),
                "node_types": Counter(),
                "node_ids": [],
                "known_package": package_id in CUSTOM_NODE_MANIFEST,
            },
        )
        entry["node_types"][class_type] += 1
        entry["node_ids"].append(node_id)

    result = []
    for package_id in sorted(records):
        entry = records[package_id]
        entry["node_types"] = dict(sorted(entry["node_types"].items()))
        entry["node_ids"] = sorted(entry["node_ids"], key=lambda value: int(value) if value.isdigit() else value)
        result.append(entry)
    return result


def collect_prompt_models(prompt: dict[str, Any], roots: list[Path]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for node_id, node in prompt.items():
        class_type = node.get("class_type")
        inputs = node.get("inputs", {})

        for input_name, category, role in PROMPT_MODEL_INPUTS.get(class_type, []):
            model_name = inputs.get(input_name)
            if not isinstance(model_name, str):
                continue
            special_case = class_type == "VAELoader" and model_name in SPECIAL_VAE_NAMES
            path = None if special_case else resolve_model_path(model_name, category, roots)
            records.append(
                {
                    "node_id": str(node_id),
                    "class_type": class_type,
                    "role": role,
                    "category": category,
                    "model_name": normalize_model_name(model_name),
                    "enabled": True,
                    "path": path,
                    "special_case": special_case,
                }
            )

        if class_type == "Power Lora Loader (rgthree)":
            for name, value in inputs.items():
                if not name.startswith("lora_") or not isinstance(value, dict):
                    continue
                model_name = value.get("lora")
                if not model_name or model_name == "None":
                    continue
                records.append(
                    {
                        "node_id": str(node_id),
                        "class_type": class_type,
                        "role": "lora",
                        "category": "loras",
                        "model_name": normalize_model_name(model_name),
                        "enabled": bool(value.get("on")),
                        "path": resolve_model_path(model_name, "loras", roots),
                        "special_case": False,
                    }
                )
    return dedupe_records(records)


def collect_workflow_models(workflow: dict[str, Any], roots: list[Path]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for node in workflow["nodes"]:
        node_id = str(node["id"])
        class_type = node["type"]
        widget_specs = [(input_name, value_index) for input_name, value_index, _, _ in WORKFLOW_MODEL_WIDGETS.get(class_type, [])]
        widgets = workflow_widget_values(node, widget_specs if widget_specs else None)

        for input_name, _value_index, category, role in WORKFLOW_MODEL_WIDGETS.get(class_type, []):
            model_name = widgets.get(input_name)
            if not isinstance(model_name, str):
                continue
            special_case = class_type == "VAELoader" and model_name in SPECIAL_VAE_NAMES
            path = None if special_case else resolve_model_path(model_name, category, roots)
            records.append(
                {
                    "node_id": node_id,
                    "class_type": class_type,
                    "role": role,
                    "category": category,
                    "model_name": normalize_model_name(model_name),
                    "enabled": True,
                    "path": path,
                    "special_case": special_case,
                }
            )

        if class_type == "Power Lora Loader (rgthree)":
            for value in node.get("widgets_values", []):
                if not isinstance(value, dict):
                    continue
                model_name = value.get("lora")
                if not model_name or model_name == "None":
                    continue
                records.append(
                    {
                        "node_id": node_id,
                        "class_type": class_type,
                        "role": "lora",
                        "category": "loras",
                        "model_name": normalize_model_name(model_name),
                        "enabled": bool(value.get("on")),
                        "path": resolve_model_path(model_name, "loras", roots),
                        "special_case": False,
                    }
                )

    return dedupe_records(records)


def dedupe_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: dict[tuple[str, str, str], dict[str, Any]] = {}
    for record in records:
        key = (record["class_type"], record["role"], record["model_name"])
        if key not in deduped:
            deduped[key] = {
                **record,
                "node_ids": [record["node_id"]],
            }
            deduped[key].pop("node_id", None)
            continue
        deduped[key]["node_ids"].append(record["node_id"])
        deduped[key]["enabled"] = deduped[key]["enabled"] or record["enabled"]
        deduped[key]["path"] = deduped[key]["path"] or record["path"]
    result = []
    for item in deduped.values():
        item["node_ids"] = sorted(item["node_ids"], key=lambda value: int(value) if value.isdigit() else value)
        result.append(item)
    result.sort(key=lambda item: (item["category"], item["model_name"], item["class_type"]))
    return result


def summarize(data: dict[str, Any], format_name: str, roots: list[Path]) -> dict[str, Any]:
    custom_nodes = collect_custom_nodes(data, format_name)
    models = collect_workflow_models(data, roots) if format_name == "workflow" else collect_prompt_models(data, roots)
    missing_models = [
        item for item in models
        if not item["special_case"] and item["path"] is None
    ]
    unresolved_packages = [item for item in custom_nodes if not item["known_package"]]
    return {
        "format": format_name,
        "search_roots": [str(root) for root in roots],
        "custom_nodes": custom_nodes,
        "models": models,
        "missing_models": missing_models,
        "unresolved_custom_nodes": unresolved_packages,
    }


def print_text_report(summary: dict[str, Any]) -> None:
    print(f"format: {summary['format']}")
    print()
    print("custom nodes:")
    if not summary["custom_nodes"]:
        print("  (none)")
    for item in summary["custom_nodes"]:
        repo = item["repo_url"] or "manual lookup required"
        status = "known" if item["known_package"] else "unknown"
        print(f"  - {item['package_id']} [{status}]")
        print(f"    dir: {item['dir_name'] or 'n/a'}")
        print(f"    repo: {repo}")
        print(f"    node_types: {', '.join(f'{name} x{count}' for name, count in item['node_types'].items())}")

    print()
    print("models:")
    if not summary["models"]:
        print("  (none)")
    for item in summary["models"]:
        status = "special" if item["special_case"] else ("found" if item["path"] else "missing")
        suffix = "" if item["enabled"] else " (present but disabled)"
        print(f"  - {item['model_name']} [{item['category']}/{item['role']}] {status}{suffix}")
        print(f"    nodes: {', '.join(item['node_ids'])}")
        if item["path"]:
            print(f"    path: {item['path']}")

    if summary["missing_models"]:
        print()
        print("missing models:")
        for item in summary["missing_models"]:
            print(f"  - {item['model_name']} ({item['category']})")

    if summary["unresolved_custom_nodes"]:
        print()
        print("unresolved custom-node packages:")
        for item in summary["unresolved_custom_nodes"]:
            print(f"  - {item['package_id']} -> {', '.join(item['node_types'])}")


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    data = load_json(args.json_path)
    format_name = detect_format(data)
    summary = summarize(data, format_name, args.search_root)

    if args.json:
        print(json.dumps(summary, indent=2, ensure_ascii=False))
    else:
        print_text_report(summary)

    if args.strict and (summary["missing_models"] or summary["unresolved_custom_nodes"]):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
