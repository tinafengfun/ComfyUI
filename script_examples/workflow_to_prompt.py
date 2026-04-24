#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SKIP_NODE_TYPES = {
    "Fast Groups Bypasser (rgthree)",
    "Note",
}

FORCED_INPUT_DEFAULTS = {
    "CLIPLoader": {"device": "cpu"},
    "DualCLIPLoader": {"device": "cpu"},
    "UNETLoader": {"device": "cpu"},
    "UnetLoaderGGUF": {"device": "cpu"},
    "UnetLoaderGGUFAdvanced": {"device": "cpu"},
    "PathchSageAttentionKJ": {"sage_attention": "disabled", "allow_compile": False},
    "ModelPatchTorchSettings": {"enable_fp16_accumulation": False},
}


def normalize_value(value):
    if isinstance(value, str):
        return value.replace("\\", "/")
    if isinstance(value, list):
        return [normalize_value(v) for v in value]
    if isinstance(value, dict):
        return {k: normalize_value(v) for k, v in value.items()}
    return value


def load_workflow(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def build_link_map(links, node_ids=None):
    link_map = {}
    known_nodes = {str(node_id) for node_id in node_ids} if node_ids is not None else None
    for link_id, from_node, from_slot, _to_node, _to_slot, _type in links:
        if known_nodes is not None and str(from_node) not in known_nodes:
            raise ValueError(f"link {link_id} references missing source node {from_node}")
        link_map[link_id] = [str(from_node), from_slot]
    return link_map


def convert_power_lora_loader(node, link_map):
    inputs = {}
    for item in node.get("inputs", []):
        name = item.get("name")
        link = item.get("link")
        if link is not None:
            inputs[name] = link_map[link]

    counter = 0
    for widget in node.get("widgets_values", []):
        if isinstance(widget, dict) and "lora" in widget:
            counter += 1
            inputs[f"lora_{counter}"] = normalize_value(widget)

    return {"class_type": node["type"], "inputs": inputs}


def convert_ksampler_advanced(node, link_map):
    prompt_inputs = {}
    widget_values = node.get("widgets_values", [])
    ordered_names = [
        "add_noise",
        "noise_seed",
        "_control_after_generate",
        "steps",
        "cfg",
        "sampler_name",
        "scheduler",
        "start_at_step",
        "end_at_step",
        "return_with_leftover_noise",
    ]
    if len(widget_values) < len(ordered_names):
        raise ValueError(
            f"KSamplerAdvanced node {node.get('id')} only has {len(widget_values)} widget values; "
            f"expected at least {len(ordered_names)}"
        )
    widget_map = {name: value for name, value in zip(ordered_names, widget_values)}

    for item in node.get("inputs", []):
        name = item.get("name")
        if not name:
            continue
        link = item.get("link")
        if link is not None:
            prompt_inputs[name] = link_map[link]
            continue
        if name in widget_map:
            prompt_inputs[name] = normalize_value(widget_map[name])

    return {"class_type": node["type"], "inputs": prompt_inputs}


def convert_standard_node(node, link_map, forced_defaults):
    prompt_inputs = {}
    widget_values = node.get("widgets_values", [])
    widget_iter = iter(widget_values if isinstance(widget_values, list) else [])
    widget_dict = widget_values if isinstance(widget_values, dict) else {}

    for item in node.get("inputs", []):
        name = item.get("name")
        if not name:
            continue
        link = item.get("link")
        widget = item.get("widget")
        widget_value = None

        if widget is not None and not isinstance(widget_values, dict):
            try:
                widget_value = next(widget_iter)
            except StopIteration:
                raise ValueError(
                    f"Node {node.get('id')} ({node.get('type')}) is missing a widget value for input {name}"
                ) from None

        if link is not None:
            prompt_inputs[name] = link_map[link]
            continue
        if item.get("type") == "IMAGEUPLOAD" or name == "upload":
            continue
        if widget is None:
            continue
        if isinstance(widget_values, dict):
            if name in widget_dict:
                prompt_inputs[name] = normalize_value(widget_dict[name])
        elif widget_value is not None:
            prompt_inputs[name] = normalize_value(widget_value)

    for name, value in forced_defaults.get(node["type"], {}).items():
        prompt_inputs[name] = value

    return {"class_type": node["type"], "inputs": prompt_inputs}


def workflow_to_prompt(workflow, forced_defaults=None):
    node_ids = {str(node["id"]) for node in workflow["nodes"]}
    link_map = build_link_map(workflow["links"], node_ids=node_ids)
    forced_defaults = forced_defaults or {}
    prompt = {}
    for node in workflow["nodes"]:
        if node["type"] in SKIP_NODE_TYPES:
            continue
        node_id = str(node["id"])
        if node["type"] == "Power Lora Loader (rgthree)":
            prompt[node_id] = convert_power_lora_loader(node, link_map)
        elif node["type"] == "KSamplerAdvanced":
            prompt[node_id] = convert_ksampler_advanced(node, link_map)
        else:
            prompt[node_id] = convert_standard_node(node, link_map, forced_defaults)
    validate_prompt_links(prompt)
    return prompt


def validate_prompt_links(prompt):
    for node_id, node in prompt.items():
        for input_name, value in node.get("inputs", {}).items():
            if isinstance(value, list) and len(value) == 2:
                ref_id = str(value[0])
                if ref_id not in prompt:
                    raise ValueError(
                        f"node {node_id} input {input_name} references missing node {ref_id}"
                    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Convert a ComfyUI workflow JSON export into an API prompt JSON.")
    parser.add_argument("workflow_json", type=Path, help="Path to a ComfyUI workflow JSON export.")
    parser.add_argument(
        "--force-device-policy",
        choices=["cpu-biased", "none"],
        default="cpu-biased",
        help="Apply migration-oriented forced defaults. 'cpu-biased' keeps the XPU migration policy; 'none' preserves workflow loader settings.",
    )
    parser.add_argument(
        "--no-force-cpu",
        action="store_true",
        help="Shortcut for --force-device-policy none.",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    force_policy = "none" if args.no_force_cpu else args.force_device_policy
    forced_defaults = FORCED_INPUT_DEFAULTS if force_policy == "cpu-biased" else {
        key: value
        for key, value in FORCED_INPUT_DEFAULTS.items()
        if key in {"PathchSageAttentionKJ", "ModelPatchTorchSettings"}
    }

    workflow = load_workflow(args.workflow_json)
    prompt = workflow_to_prompt(workflow, forced_defaults=forced_defaults)
    json.dump(prompt, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
