import sys
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from script_examples.workflow_to_prompt import (  # noqa: E402
    FORCED_INPUT_DEFAULTS,
    convert_ksampler_advanced,
    convert_standard_node,
    workflow_to_prompt,
)


def test_workflow_to_prompt_keeps_mode_4_nodes_and_normalizes_values():
    workflow = {
        "nodes": [
            {
                "id": 1,
                "type": "CLIPLoader",
                "mode": 4,
                "inputs": [
                    {"name": "clip_name", "widget": {"name": "clip_name"}, "link": None},
                    {"name": "type", "widget": {"name": "type"}, "link": None},
                    {"name": "device", "widget": {"name": "device"}, "link": None},
                ],
                "widgets_values": ["WAN\\2.2\\umt5.safetensors", "wan", "default"],
            },
            {
                "id": 2,
                "type": "KSamplerAdvanced",
                "mode": 4,
                "inputs": [
                    {"name": "model", "link": 10},
                    {"name": "positive", "link": 11},
                    {"name": "negative", "link": 12},
                    {"name": "latent_image", "link": 13},
                    {"name": "add_noise", "widget": {"name": "add_noise"}},
                    {"name": "noise_seed", "widget": {"name": "noise_seed"}},
                    {"name": "steps", "widget": {"name": "steps"}},
                    {"name": "cfg", "widget": {"name": "cfg"}},
                    {"name": "sampler_name", "widget": {"name": "sampler_name"}},
                    {"name": "scheduler", "widget": {"name": "scheduler"}},
                    {"name": "start_at_step", "widget": {"name": "start_at_step"}},
                    {"name": "end_at_step", "widget": {"name": "end_at_step"}},
                    {"name": "return_with_leftover_noise", "widget": {"name": "return_with_leftover_noise"}},
                ],
                "widgets_values": ["enable", 1234, "fixed", 6, 1.0, "euler", "simple", 0, 6, "disable"],
            },
            {"id": 3, "type": "Model", "mode": 0, "inputs": [], "widgets_values": []},
            {"id": 4, "type": "Cond", "mode": 0, "inputs": [], "widgets_values": []},
            {"id": 5, "type": "Cond", "mode": 0, "inputs": [], "widgets_values": []},
            {"id": 6, "type": "Latent", "mode": 0, "inputs": [], "widgets_values": []},
        ],
        "links": [
            [10, 3, 0, 2, 0, "MODEL"],
            [11, 4, 0, 2, 1, "CONDITIONING"],
            [12, 5, 0, 2, 2, "CONDITIONING"],
            [13, 6, 0, 2, 3, "LATENT"],
        ],
    }

    prompt = workflow_to_prompt(workflow, forced_defaults=FORCED_INPUT_DEFAULTS)

    assert "1" in prompt
    assert "2" in prompt
    assert prompt["1"]["inputs"]["clip_name"] == "WAN/2.2/umt5.safetensors"
    assert prompt["1"]["inputs"]["device"] == "cpu"
    assert prompt["2"]["inputs"]["add_noise"] == "enable"
    assert prompt["2"]["inputs"]["steps"] == 6


def test_workflow_to_prompt_rejects_missing_link_source_nodes():
    workflow = {
        "nodes": [
            {"id": 1, "type": "PreviewImage", "mode": 0, "inputs": [{"name": "images", "link": 99}], "widgets_values": []},
        ],
        "links": [
            [99, 404, 0, 1, 0, "IMAGE"],
        ],
    }

    with pytest.raises(ValueError, match="missing source node 404"):
        workflow_to_prompt(workflow)


def test_convert_standard_node_raises_when_widget_values_are_missing():
    node = {
        "id": 10,
        "type": "CLIPLoader",
        "inputs": [
            {"name": "clip_name", "widget": {"name": "clip_name"}, "link": None},
            {"name": "type", "widget": {"name": "type"}, "link": None},
            {"name": "device", "widget": {"name": "device"}, "link": None},
        ],
        "widgets_values": ["umt5.safetensors", "wan"],
    }

    with pytest.raises(ValueError, match="missing a widget value"):
        convert_standard_node(node, {}, {})


def test_convert_ksampler_advanced_raises_when_widget_values_are_short():
    node = {
        "id": 20,
        "type": "KSamplerAdvanced",
        "inputs": [],
        "widgets_values": ["enable", 1234],
    }

    with pytest.raises(ValueError, match="expected at least 10"):
        convert_ksampler_advanced(node, {})
