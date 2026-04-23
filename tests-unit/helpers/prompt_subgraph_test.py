import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
loaded_utils = sys.modules.get("utils")
loaded_utils_file = getattr(loaded_utils, "__file__", "") if loaded_utils is not None else ""
if loaded_utils is not None and str(REPO_ROOT / "utils") not in loaded_utils_file:
    for name in list(sys.modules):
        if name == "utils" or name.startswith("utils."):
            del sys.modules[name]

from utils.prompt_subgraph import apply_filename_prefix, apply_sampler_overrides, extract_prompt_subgraph


def test_extract_prompt_subgraph_keeps_only_selected_branch():
    prompt = {
        "1": {"class_type": "Loader", "inputs": {}},
        "2": {"class_type": "KSamplerAdvanced", "inputs": {"model": ["1", 0], "steps": 8, "start_at_step": 0, "end_at_step": 8}},
        "3": {"class_type": "VAEDecode", "inputs": {"samples": ["2", 0]}},
        "4": {"class_type": "VHS_VideoCombine", "inputs": {"images": ["3", 0], "filename_prefix": "branch-a"}},
        "9": {"class_type": "Orphan", "inputs": {}},
    }

    branch = extract_prompt_subgraph(prompt, ["4"])

    assert list(branch.keys()) == ["1", "2", "3", "4"]


def test_extract_prompt_subgraph_follows_nested_links():
    prompt = {
        "1": {"class_type": "Loader", "inputs": {}},
        "2": {"class_type": "Custom", "inputs": {"bundle": {"clip": ["1", 0]}}},
        "3": {"class_type": "Output", "inputs": {"value": ["2", 0]}},
    }

    branch = extract_prompt_subgraph(prompt, ["3"])

    assert list(branch.keys()) == ["1", "2", "3"]


def test_apply_sampler_overrides_clamps_advanced_schedule():
    prompt = {
        "2": {
            "class_type": "KSamplerAdvanced",
            "inputs": {
                "steps": 12,
                "noise_seed": 99,
                "start_at_step": 9,
                "end_at_step": 12,
            },
        }
    }

    apply_sampler_overrides(prompt, steps=4, seed=7)

    assert prompt["2"]["inputs"]["steps"] == 4
    assert prompt["2"]["inputs"]["noise_seed"] == 7
    assert prompt["2"]["inputs"]["start_at_step"] == 0
    assert prompt["2"]["inputs"]["end_at_step"] == 4


def test_apply_filename_prefix_updates_output_nodes():
    prompt = {
        "4": {"class_type": "VHS_VideoCombine", "inputs": {"filename_prefix": "old", "images": ["3", 0]}},
        "5": {"class_type": "SaveImage", "inputs": {"filename_prefix": "old2", "images": ["3", 0]}},
    }

    apply_filename_prefix(prompt, "debug-output")

    assert prompt["4"]["inputs"]["filename_prefix"] == "debug-output"
    assert prompt["5"]["inputs"]["filename_prefix"] == "debug-output"
