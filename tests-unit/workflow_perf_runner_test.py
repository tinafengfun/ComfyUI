import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
UTILS_ROOT = REPO_ROOT / "utils"
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
if str(UTILS_ROOT) not in sys.path:
    sys.path.insert(0, str(UTILS_ROOT))

from execution import PromptExecutor
from script_examples.workflow_perf_runner import (
    extract_node_timings,
    infer_stage,
    stamp_filename_prefixes,
    summarize_node_timings,
    summarize_xpu_samples,
)


class _FakeServer:
    client_id = None

    def __init__(self):
        self.sent = []

    def send_sync(self, event, data, client_id):
        self.sent.append((event, data, client_id))


def test_infer_stage_marks_sampler_high_noise_only_when_noise_is_enabled():
    assert infer_stage("KSamplerAdvanced", {"add_noise": "enable", "start_at_step": 0}) == "sampler_high_noise"
    assert infer_stage("KSamplerAdvanced", {"add_noise": "disable", "start_at_step": 0}) == "sampler_low_noise"


def test_extract_node_timings_uses_duration_and_timestamps():
    prompt = {
        "203": {
            "class_type": "KSamplerAdvanced",
            "inputs": {
                "add_noise": "enable",
                "start_at_step": 0,
            },
        },
        "204": {
            "class_type": "KSamplerAdvanced",
            "inputs": {
                "add_noise": "disable",
                "start_at_step": 0,
            },
        },
    }
    history = {
        "status": {
            "messages": [
                ["node_execution_start", {"node": "203", "display_node": "203", "node_type": "KSamplerAdvanced", "timestamp": 100}],
                ["node_execution_end", {"node": "203", "display_node": "203", "node_type": "KSamplerAdvanced", "status": "success", "duration_ms": 25, "timestamp": 125}],
                ["node_execution_start", {"node": "204", "display_node": "204", "node_type": "KSamplerAdvanced", "timestamp": 200}],
                ["node_execution_end", {"node": "204", "display_node": "204", "node_type": "KSamplerAdvanced", "status": "success", "timestamp": 240}],
            ]
        }
    }

    timings = extract_node_timings(history, prompt)

    assert timings[0]["node"] == "203"
    assert timings[0]["duration_ms"] == 25
    assert timings[0]["stage"] == "sampler_high_noise"

    assert timings[1]["node"] == "204"
    assert timings[1]["duration_ms"] == 40
    assert timings[1]["stage"] == "sampler_low_noise"


def test_summarize_node_timings_groups_nodes_by_stage():
    summary = summarize_node_timings(
        [
            {"node": "1", "node_type": "KSamplerAdvanced", "stage": "sampler_high_noise", "duration_ms": 10, "status": "success"},
            {"node": "2", "node_type": "VAEDecode", "stage": "vae_decode", "duration_ms": 20, "status": "success"},
            {"node": "3", "node_type": "Other", "stage": "vae_decode", "duration_ms": 5, "status": "error"},
        ]
    )

    assert summary["total_node_duration_ms"] == 30
    assert summary["stages"][0]["stage"] == "sampler_high_noise"
    assert summary["stages"][1]["stage"] == "vae_decode"
    assert summary["stages"][1]["duration_ms"] == 25
    assert summary["nodes"][0]["node"] == "2"


def test_summarize_xpu_samples_reports_peaks_and_averages():
    summary = summarize_xpu_samples(
        [
            {"memory_used_mib": 10.0, "gpu_util_pct": 20.0, "compute_engine_group_pct": 30.0, "render_engine_group_pct": 1.0, "media_engine_group_pct": 0.0, "eu_active_pct": 40.0},
            {"memory_used_mib": 30.0, "gpu_util_pct": 10.0, "compute_engine_group_pct": 50.0, "render_engine_group_pct": 3.0, "media_engine_group_pct": 0.0, "eu_active_pct": 20.0},
        ]
    )

    assert summary["samples"] == 2
    assert summary["peak_memory_mib"] == 30.0
    assert summary["avg_gpu_util_pct"] == 15.0
    assert summary["peak_compute_group_pct"] == 50.0
    assert summary["avg_eu_active_pct"] == 30.0


def test_stamp_filename_prefixes_updates_output_nodes_only():
    prompt = {
        "10": {"class_type": "VHS_VideoCombine", "inputs": {"filename_prefix": "old"}},
        "11": {"class_type": "SaveImage", "inputs": {"filename_prefix": "old2"}},
        "12": {"class_type": "KSamplerAdvanced", "inputs": {"steps": 4}},
    }

    stamp_filename_prefixes(prompt, "perf-run")

    assert prompt["10"]["inputs"]["filename_prefix"] == "perf-run-10"
    assert prompt["11"]["inputs"]["filename_prefix"] == "perf-run-11"
    assert "filename_prefix" not in prompt["12"]["inputs"]


def test_add_message_adds_timestamp_and_keeps_status_messages_without_broadcast():
    server = _FakeServer()
    executor = PromptExecutor(server)

    executor.add_message("node_execution_start", {"prompt_id": "p1", "node": "1"}, broadcast=False)

    assert len(executor.status_messages) == 1
    event, payload = executor.status_messages[0]
    assert event == "node_execution_start"
    assert "timestamp" in payload
    assert server.sent == []
