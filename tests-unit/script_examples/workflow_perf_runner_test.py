from script_examples.workflow_perf_runner import extract_node_timings, infer_stage


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
