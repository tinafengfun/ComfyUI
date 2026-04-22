#!/usr/bin/env python3

from __future__ import annotations

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


def build_link_map(links):
    link_map = {}
    for link_id, from_node, from_slot, _to_node, _to_slot, _type in links:
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


def convert_standard_node(node, link_map):
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
                widget_value = None

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

    for name, value in FORCED_INPUT_DEFAULTS.get(node["type"], {}).items():
        prompt_inputs[name] = value

    return {"class_type": node["type"], "inputs": prompt_inputs}


def workflow_to_prompt(workflow):
    link_map = build_link_map(workflow["links"])
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
            prompt[node_id] = convert_standard_node(node, link_map)
    return prompt


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: workflow_to_prompt.py <workflow.json>", file=sys.stderr)
        return 2

    workflow = load_workflow(Path(sys.argv[1]))
    prompt = workflow_to_prompt(workflow)
    json.dump(prompt, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
