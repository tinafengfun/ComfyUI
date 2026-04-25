import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from script_examples.workflow_branch_runner import (  # noqa: E402
    detect_input_format,
    forced_defaults_for_policy,
    prepare_prompt,
)


def test_detect_input_format_distinguishes_workflow_from_prompt():
    assert detect_input_format({"nodes": [], "links": []}) == "workflow"
    assert detect_input_format({"1": {"class_type": "PreviewImage", "inputs": {}}}) == "prompt"


def test_prepare_prompt_converts_workflow_and_applies_cpu_biased_defaults():
    workflow = {
        "nodes": [
            {
                "id": 1,
                "type": "CLIPLoader",
                "inputs": [
                    {"name": "clip_name", "widget": {"name": "clip_name"}, "link": None},
                    {"name": "type", "widget": {"name": "type"}, "link": None},
                    {"name": "device", "widget": {"name": "device"}, "link": None},
                ],
                "widgets_values": ["WAN\\umt5_xxl_fp16.safetensors", "wan", "default"],
            },
            {
                "id": 2,
                "type": "PathchSageAttentionKJ",
                "inputs": [
                    {"name": "model", "link": 10},
                    {"name": "sage_attention", "widget": {"name": "sage_attention"}, "link": None},
                    {"name": "allow_compile", "widget": {"name": "allow_compile"}, "link": None},
                ],
                "widgets_values": ["auto", True],
            },
            {
                "id": 3,
                "type": "ModelPatchTorchSettings",
                "inputs": [
                    {"name": "model", "link": 11},
                    {"name": "enable_fp16_accumulation", "widget": {"name": "enable_fp16_accumulation"}, "link": None},
                ],
                "widgets_values": [True],
            },
            {"id": 4, "type": "Model", "inputs": [], "widgets_values": []},
            {"id": 5, "type": "Model", "inputs": [], "widgets_values": []},
        ],
        "links": [
            [10, 4, 0, 2, 0, "MODEL"],
            [11, 5, 0, 3, 0, "MODEL"],
        ],
    }

    prompt, payload_format = prepare_prompt(workflow, "cpu-biased")

    assert payload_format == "workflow"
    assert prompt["1"]["inputs"]["clip_name"] == "umt5_xxl_fp16.safetensors"
    assert prompt["1"]["inputs"]["device"] == "cpu"
    assert prompt["2"]["inputs"]["sage_attention"] == "disabled"
    assert prompt["2"]["inputs"]["allow_compile"] is False
    assert prompt["3"]["inputs"]["enable_fp16_accumulation"] is False


def test_prepare_prompt_none_policy_keeps_loader_device_defaults():
    workflow = {
        "nodes": [
            {
                "id": 1,
                "type": "CLIPLoader",
                "inputs": [
                    {"name": "clip_name", "widget": {"name": "clip_name"}, "link": None},
                    {"name": "type", "widget": {"name": "type"}, "link": None},
                    {"name": "device", "widget": {"name": "device"}, "link": None},
                ],
                "widgets_values": ["umt5_xxl_fp16.safetensors", "wan", "default"],
            },
        ],
        "links": [],
    }

    prompt, payload_format = prepare_prompt(workflow, "none")

    assert payload_format == "workflow"
    assert prompt["1"]["inputs"]["device"] == "default"


def test_forced_defaults_for_policy_none_keeps_only_kj_safety_overrides():
    defaults = forced_defaults_for_policy("none")

    assert "CLIPLoader" not in defaults
    assert defaults["PathchSageAttentionKJ"]["sage_attention"] == "disabled"
    assert defaults["ModelPatchTorchSettings"]["enable_fp16_accumulation"] is False
