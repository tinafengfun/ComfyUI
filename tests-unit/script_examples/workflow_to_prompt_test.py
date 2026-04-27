import sys
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from script_examples.workflow_to_prompt import (  # noqa: E402
    FORCED_INPUT_DEFAULTS,
    convert_ordered_widget_node,
    convert_qwen3_vqa,
    convert_rife_vfi,
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
    assert prompt["1"]["inputs"]["clip_name"] == "umt5.safetensors"
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


def test_workflow_to_prompt_skips_reroute_and_relinks_to_original_source():
    workflow = {
        "nodes": [
            {"id": 1, "type": "Image", "mode": 0, "inputs": [], "widgets_values": []},
            {"id": 2, "type": "Reroute", "mode": 0, "inputs": [{"name": "", "link": 10}], "widgets_values": []},
            {"id": 3, "type": "PreviewImage", "mode": 0, "inputs": [{"name": "images", "link": 11}], "widgets_values": []},
        ],
        "links": [
            [10, 1, 0, 2, 0, "IMAGE"],
            [11, 2, 0, 3, 0, "IMAGE"],
        ],
    }

    prompt = workflow_to_prompt(workflow)

    assert "2" not in prompt
    assert prompt["3"]["inputs"]["images"] == ["1", 0]


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


def test_convert_rife_vfi_backfills_new_required_defaults():
    node = {
        "id": 53,
        "type": "RIFE VFI",
        "inputs": [
            {"name": "frames", "link": 10},
            {"name": "optional_interpolation_states", "link": None},
            {"name": "ckpt_name", "widget": {"name": "ckpt_name"}},
            {"name": "clear_cache_after_n_frames", "widget": {"name": "clear_cache_after_n_frames"}},
            {"name": "multiplier", "widget": {"name": "multiplier"}},
            {"name": "fast_mode", "widget": {"name": "fast_mode"}},
            {"name": "ensemble", "widget": {"name": "ensemble"}},
            {"name": "scale_factor", "widget": {"name": "scale_factor"}},
            {"name": "dtype", "widget": {"name": "dtype"}},
            {"name": "torch_compile", "widget": {"name": "torch_compile"}},
            {"name": "batch_size", "widget": {"name": "batch_size"}},
        ],
        "widgets_values": ["rife47.pth", 8, 2, True, True, 1],
    }

    prompt_node = convert_rife_vfi(node, {10: ["1", 0]})

    assert prompt_node["inputs"]["frames"] == ["1", 0]
    assert prompt_node["inputs"]["dtype"] == "float32"
    assert prompt_node["inputs"]["torch_compile"] is False
    assert prompt_node["inputs"]["batch_size"] == 1


def test_convert_qwen3_vqa_ignores_legacy_extra_widget_before_attention():
    node = {
        "id": 71,
        "type": "Qwen3_VQA",
        "inputs": [
            {"name": "source_path", "link": None},
            {"name": "image", "link": 20},
            {"name": "text", "widget": {"name": "text"}},
            {"name": "model", "widget": {"name": "model"}},
            {"name": "quantization", "widget": {"name": "quantization"}},
            {"name": "keep_model_loaded", "widget": {"name": "keep_model_loaded"}},
            {"name": "temperature", "widget": {"name": "temperature"}},
            {"name": "max_new_tokens", "widget": {"name": "max_new_tokens"}},
            {"name": "min_pixels", "widget": {"name": "min_pixels"}},
            {"name": "max_pixels", "widget": {"name": "max_pixels"}},
            {"name": "seed", "widget": {"name": "seed"}},
            {"name": "attention", "widget": {"name": "attention"}},
        ],
        "widgets_values": ["prompt", "Qwen3-VL-4B-Instruct-FP8", "none", False, 0.7, 2048, 200704, 1003520, 1596, "randomize", "eager"],
    }

    prompt_node = convert_qwen3_vqa(node, {20: ["75", 0]})

    assert prompt_node["inputs"]["image"] == ["75", 0]
    assert prompt_node["inputs"]["seed"] == 1596
    assert prompt_node["inputs"]["attention"] == "eager"


def test_convert_ordered_widget_node_normalizes_lora_selector_values():
    node = {
        "id": 231,
        "type": "LoraLoaderModelOnly",
        "inputs": [
            {"name": "model", "link": 10},
            {"name": "lora_name", "widget": {"name": "lora_name"}},
            {"name": "strength_model", "widget": {"name": "strength_model"}},
        ],
        "widgets_values": ["Wan\\lightx2v_I2V_14B_480p_cfg_step_distill_rank256_bf16.safetensors", 1.0],
    }

    prompt_node = convert_ordered_widget_node(node, {10: ["68", 0]})

    assert prompt_node["inputs"]["model"] == ["68", 0]
    assert prompt_node["inputs"]["lora_name"] == "lightx2v_I2V_14B_480p_cfg_step_distill_rank256_bf16.safetensors"
    assert prompt_node["inputs"]["strength_model"] == 1.0


def test_convert_ksampler_advanced_raises_when_widget_values_are_short():
    node = {
        "id": 20,
        "type": "KSamplerAdvanced",
        "inputs": [],
        "widgets_values": ["enable", 1234],
    }

    with pytest.raises(ValueError, match="expected at least 10"):
        convert_ksampler_advanced(node, {})
