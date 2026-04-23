#!/usr/bin/env python3

from __future__ import annotations

import argparse
import csv
import json
import os
import subprocess
import sys
import threading
import time
import uuid
from collections import defaultdict
from pathlib import Path
from urllib import error, request

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from utils.prompt_subgraph import apply_filename_prefix, extract_prompt_subgraph


ATTEMPT_LOG_ENV = "COMFY_MIGRATION_ATTEMPT_LOG"
SAMPLER_TYPES = {"KSampler", "KSamplerAdvanced"}
OUTPUT_TYPES = {"VHS_VideoCombine", "SaveImage", "PreviewImage"}


def fetch_json(url: str) -> dict:
    with request.urlopen(url) as response:
        return json.loads(response.read())


def queue_prompt(server_address: str, prompt: dict, prompt_id: str, client_id: str) -> dict:
    payload = {"prompt": prompt, "prompt_id": prompt_id, "client_id": client_id}
    data = json.dumps(payload).encode("utf-8")
    req = request.Request(
        f"http://{server_address}/prompt",
        data=data,
        headers={"Content-Type": "application/json"},
    )
    with request.urlopen(req) as response:
        return json.loads(response.read())


def wait_for_history(server_address: str, prompt_id: str, poll_interval: float) -> dict:
    url = f"http://{server_address}/history/{prompt_id}"
    while True:
        try:
            history = fetch_json(url)
        except error.HTTPError as exc:
            if exc.code == 404:
                time.sleep(poll_interval)
                continue
            raise
        except error.URLError as exc:
            raise RuntimeError(f"ComfyUI is unavailable at {server_address}: {exc.reason}") from exc

        if prompt_id in history:
            return history[prompt_id]
        if history:
            return history
        time.sleep(poll_interval)


def load_prompt(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def append_attempt_log(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")


def default_attempt_log() -> Path:
    override = os.environ.get(ATTEMPT_LOG_ENV)
    if override:
        return Path(override)
    return REPO_ROOT / "temp" / "perf_attempts.jsonl"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run a ComfyUI workflow prompt with node timing and XPU telemetry collection.")
    parser.add_argument("prompt_json", type=Path, help="Path to a ComfyUI API prompt JSON file.")
    parser.add_argument("--path-id", required=True, help="Logical id for this benchmark path, for example R0-Baseline.")
    parser.add_argument("--server", default="127.0.0.1:8188", help="ComfyUI host:port.")
    parser.add_argument("--poll-interval", type=float, default=2.0, help="History polling interval in seconds.")
    parser.add_argument("--device", default="0", help="xpu-smi device id or PCI BDF.")
    parser.add_argument("--xpu-sample-seconds", type=float, default=1.0, help="xpu-smi dump interval in seconds.")
    parser.add_argument("--attempt-log", type=Path, default=default_attempt_log(), help="JSONL file to append attempt records to.")
    parser.add_argument("--artifact-dir", type=Path, default=REPO_ROOT / "temp" / "perf-runs", help="Directory for reports and xpu csv artifacts.")
    parser.add_argument("--output-node", action="append", help="Optional output node id(s) to isolate before submission.")
    parser.add_argument("--filename-prefix-base", help="Optional base prefix to stamp onto all output nodes.")
    parser.add_argument("--launch-flags", help="Server launch flags used for this run.")
    parser.add_argument("--prompt-command", help="Prompt conversion command used for this run.")
    parser.add_argument("--prompt-policy", help="Short description of the device/prompt policy used for this run.")
    parser.add_argument("--notes", help="Freeform note for this path.")
    return parser


def infer_stage(node_type: str, inputs: dict) -> str:
    if node_type in {"LoadImage", "ImageResizeKJv2", "EmptyHunyuanLatentVideo", "INTConstant", "FloatConstant", "SimpleMath+"}:
        return "preprocess"
    if node_type in {"CLIPLoader", "DualCLIPLoader", "CLIPVisionLoader", "CLIPTextEncode", "CLIPVisionEncode", "WanImageToVideo", "WanFirstLastFrameToVideo"}:
        return "encoding"
    if node_type in {"Power Lora Loader (rgthree)", "ModelSamplingSD3", "PathchSageAttentionKJ", "ModelPatchTorchSettings", "UNETLoader", "UnetLoaderGGUF", "UnetLoaderGGUFAdvanced"}:
        return "model_setup"
    if node_type in SAMPLER_TYPES:
        if inputs.get("add_noise") == "enable":
            return "sampler_high_noise"
        return "sampler_low_noise"
    if node_type in {"VAELoader", "VAEDecode"}:
        return "vae_decode"
    if node_type in {"LayerUtility: PurgeVRAM V2"}:
        return "memory_cleanup"
    if node_type in OUTPUT_TYPES:
        return "output_postprocess"
    return "other"


def extract_node_timings(history: dict, prompt: dict) -> list[dict]:
    messages = history.get("status", {}).get("messages", [])
    start_messages = {}
    node_timings = []
    for event_name, payload in messages:
        if event_name == "node_execution_start":
            start_messages[payload["node"]] = payload
        elif event_name == "node_execution_end":
            node_id = payload["node"]
            start_payload = start_messages.get(node_id, {})
            node_info = prompt.get(str(node_id), {})
            inputs = node_info.get("inputs", {})
            duration_ms = payload.get("duration_ms")
            if duration_ms is None and start_payload:
                duration_ms = payload.get("timestamp", 0) - start_payload.get("timestamp", 0)
            node_timings.append(
                {
                    "node": str(node_id),
                    "display_node": str(payload.get("display_node", node_id)),
                    "node_type": payload.get("node_type", node_info.get("class_type")),
                    "stage": infer_stage(payload.get("node_type", node_info.get("class_type", "")), inputs),
                    "status": payload.get("status"),
                    "start_ts": start_payload.get("timestamp"),
                    "end_ts": payload.get("timestamp"),
                    "duration_ms": duration_ms,
                }
            )
    node_timings.sort(key=lambda item: (item["start_ts"] or 0, item["node"]))
    return node_timings


def summarize_node_timings(node_timings: list[dict]) -> dict:
    total_ms = sum(item["duration_ms"] or 0 for item in node_timings if item.get("status") == "success")
    by_stage = defaultdict(lambda: {"duration_ms": 0, "nodes": []})
    by_node = []
    for item in node_timings:
        duration = item["duration_ms"] or 0
        by_stage[item["stage"]]["duration_ms"] += duration
        by_stage[item["stage"]]["nodes"].append(item["node"])
        by_node.append(
            {
                "node": item["node"],
                "node_type": item["node_type"],
                "stage": item["stage"],
                "duration_ms": duration,
                "status": item["status"],
            }
        )
    stages = []
    for stage_name, info in sorted(by_stage.items()):
        duration_ms = info["duration_ms"]
        stages.append(
            {
                "stage": stage_name,
                "duration_ms": duration_ms,
                "workflow_share_pct": (duration_ms / total_ms * 100.0) if total_ms else 0.0,
                "node_ids": sorted(set(info["nodes"]), key=lambda value: int(value) if value.isdigit() else value),
            }
        )
    return {
        "total_node_duration_ms": total_ms,
        "stages": stages,
        "nodes": sorted(by_node, key=lambda item: item["duration_ms"], reverse=True),
    }


def metric_map(payload: dict) -> dict[str, float]:
    result = {}
    for item in payload.get("device_level", []):
        metric_type = item.get("metrics_type")
        if metric_type is not None:
            result[metric_type] = item.get("value")
    return result


def safe_mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def collect_xpu_sample(device: str) -> dict | None:
    proc = subprocess.run(
        ["xpu-smi", "stats", "-d", str(device), "-e", "-j"],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        return None
    try:
        payload = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return None

    metrics = metric_map(payload)
    engine_util = payload.get("engine_util", {})
    compute_values = [float(item.get("value", 0.0)) for item in engine_util.get("compute", [])]
    render_values = [float(item.get("value", 0.0)) for item in engine_util.get("render", [])]
    copy_values = [float(item.get("value", 0.0)) for item in engine_util.get("copy", [])]
    media_values = [float(item.get("value", 0.0)) for item in engine_util.get("decoder", []) + engine_util.get("encoder", []) + engine_util.get("media_enhancement", [])]

    return {
        "sample_ts_ms": int(time.time() * 1000),
        "device_id": payload.get("device_id"),
        "gpu_util_pct": float(metrics.get("XPUM_STATS_GPU_UTILIZATION", 0.0)),
        "memory_used_mib": float(metrics.get("XPUM_STATS_MEMORY_USED", 0.0)),
        "memory_util_pct": float(metrics.get("XPUM_STATS_MEMORY_UTILIZATION", 0.0)),
        "compute_engine_group_pct": float(metrics.get("XPUM_STATS_ENGINE_GROUP_COMPUTE_ALL_UTILIZATION", 0.0)),
        "render_engine_group_pct": float(metrics.get("XPUM_STATS_ENGINE_GROUP_RENDER_ALL_UTILIZATION", 0.0)),
        "media_engine_group_pct": float(metrics.get("XPUM_STATS_ENGINE_GROUP_MEDIA_ALL_UTILIZATION", 0.0)),
        "copy_engine_group_pct": float(metrics.get("XPUM_STATS_ENGINE_GROUP_COPY_ALL_UTILIZATION", 0.0)),
        "eu_active_pct": float(metrics.get("XPUM_STATS_EU_ACTIVE", 0.0)),
        "eu_stall_pct": float(metrics.get("XPUM_STATS_EU_STALL", 0.0)),
        "eu_idle_pct": float(metrics.get("XPUM_STATS_EU_IDLE", 0.0)),
        "compute_engine_avg_pct": safe_mean(compute_values),
        "render_engine_avg_pct": safe_mean(render_values),
        "copy_engine_avg_pct": safe_mean(copy_values),
        "media_engine_avg_pct": safe_mean(media_values),
    }


def xpu_collector(csv_path: Path, device: str, sample_seconds: float, stop_event: threading.Event) -> None:
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "sample_ts_ms",
        "device_id",
        "gpu_util_pct",
        "memory_used_mib",
        "memory_util_pct",
        "compute_engine_group_pct",
        "render_engine_group_pct",
        "media_engine_group_pct",
        "copy_engine_group_pct",
        "eu_active_pct",
        "eu_stall_pct",
        "eu_idle_pct",
        "compute_engine_avg_pct",
        "render_engine_avg_pct",
        "copy_engine_avg_pct",
        "media_engine_avg_pct",
    ]
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        handle.flush()
        while not stop_event.is_set():
            sample = collect_xpu_sample(device)
            if sample is not None:
                writer.writerow(sample)
                handle.flush()
            stop_event.wait(sample_seconds)


def load_xpu_samples(csv_path: Path) -> list[dict]:
    if not csv_path.exists():
        return []
    rows = []
    with csv_path.open("r", encoding="utf-8", errors="ignore") as handle:
        reader = csv.DictReader(handle, skipinitialspace=True)
        for row in reader:
            try:
                rows.append(
                    {
                        "sample_ts_ms": int(float(row.get("sample_ts_ms", 0))),
                        "gpu_util_pct": float(row.get("gpu_util_pct", 0.0)),
                        "memory_used_mib": float(row.get("memory_used_mib", 0.0)),
                        "compute_engine_group_pct": float(row.get("compute_engine_group_pct", 0.0)),
                        "render_engine_group_pct": float(row.get("render_engine_group_pct", 0.0)),
                        "media_engine_group_pct": float(row.get("media_engine_group_pct", 0.0)),
                        "copy_engine_group_pct": float(row.get("copy_engine_group_pct", 0.0)),
                        "eu_active_pct": float(row.get("eu_active_pct", 0.0)),
                        "eu_stall_pct": float(row.get("eu_stall_pct", 0.0)),
                        "eu_idle_pct": float(row.get("eu_idle_pct", 0.0)),
                    }
                )
            except (TypeError, ValueError):
                continue
    return rows


def summarize_xpu_samples(samples: list[dict]) -> dict:
    if not samples:
        return {"samples": 0}
    return {
        "samples": len(samples),
        "peak_memory_mib": max(sample["memory_used_mib"] for sample in samples),
        "avg_memory_mib": sum(sample["memory_used_mib"] for sample in samples) / len(samples),
        "peak_gpu_util_pct": max(sample["gpu_util_pct"] for sample in samples),
        "avg_gpu_util_pct": sum(sample["gpu_util_pct"] for sample in samples) / len(samples),
        "peak_compute_group_pct": max(sample["compute_engine_group_pct"] for sample in samples),
        "avg_compute_group_pct": sum(sample["compute_engine_group_pct"] for sample in samples) / len(samples),
        "peak_render_group_pct": max(sample["render_engine_group_pct"] for sample in samples),
        "avg_render_group_pct": sum(sample["render_engine_group_pct"] for sample in samples) / len(samples),
        "peak_media_group_pct": max(sample["media_engine_group_pct"] for sample in samples),
        "avg_media_group_pct": sum(sample["media_engine_group_pct"] for sample in samples) / len(samples),
        "peak_eu_active_pct": max(sample["eu_active_pct"] for sample in samples),
        "avg_eu_active_pct": sum(sample["eu_active_pct"] for sample in samples) / len(samples),
    }


def summarize_stage_xpu(node_timings: list[dict], samples: list[dict], prompt_start_ms: int | None, prompt_end_ms: int | None) -> list[dict]:
    if not samples or prompt_start_ms is None or prompt_end_ms is None or prompt_end_ms <= prompt_start_ms:
        return []
    stages = defaultdict(list)
    for item in node_timings:
        if item.get("start_ts") is None or item.get("end_ts") is None:
            continue
        stages[item["stage"]].append(item)

    stage_summaries = []
    for stage_name, items in sorted(stages.items()):
        intervals = sorted(
            (item["start_ts"], item["end_ts"])
            for item in items
            if item.get("start_ts") is not None and item.get("end_ts") is not None
        )
        stage_samples = [
            sample
            for sample in samples
            if any(start <= sample.get("sample_ts_ms", 0) <= end for start, end in intervals)
        ]
        if not stage_samples:
            stage_samples = [
                sample
                for sample in samples
                if prompt_start_ms <= sample.get("sample_ts_ms", 0) <= prompt_end_ms
            ]
        summary = summarize_xpu_samples(stage_samples)
        summary.update(
            {
                "stage": stage_name,
                "sample_window": [
                    stage_samples[0]["sample_ts_ms"],
                    stage_samples[-1]["sample_ts_ms"],
                ] if stage_samples else [],
                "interval_count": len(intervals),
            }
        )
        stage_summaries.append(summary)
    return stage_summaries


def probe_media(path: Path) -> dict:
    info = {
        "path": str(path),
        "exists": path.exists(),
    }
    if not path.exists():
        return info

    info["size_bytes"] = path.stat().st_size
    proc = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "stream=codec_name,width,height,r_frame_rate,nb_frames,duration",
            "-of",
            "json",
            str(path),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        info["ffprobe_error"] = proc.stderr.strip()
        return info
    try:
        payload = json.loads(proc.stdout)
    except json.JSONDecodeError:
        info["ffprobe_error"] = "invalid_json"
        return info
    streams = payload.get("streams", [])
    if streams:
        info["streams"] = streams
    return info


def summarize_outputs(history: dict) -> list[dict]:
    outputs = []
    for node_id, node_outputs in history.get("outputs", {}).items():
        for asset_type, entries in node_outputs.items():
            for entry in entries:
                asset = {
                    "node": str(node_id),
                    "asset_type": asset_type,
                    "filename": entry.get("filename"),
                    "subfolder": entry.get("subfolder"),
                    "comfy_type": entry.get("type"),
                    "format": entry.get("format"),
                    "frame_rate": entry.get("frame_rate"),
                    "workflow_preview": entry.get("workflow"),
                }
                fullpath = entry.get("fullpath")
                if fullpath:
                    asset["file"] = probe_media(Path(fullpath))
                outputs.append(asset)
    return outputs


def summarize_history(history: dict, prompt: dict, samples: list[dict]) -> dict:
    status_messages = history.get("status", {}).get("messages", [])
    prompt_start_ms = None
    prompt_end_ms = None
    for event_name, payload in status_messages:
        if event_name == "execution_start":
            prompt_start_ms = payload.get("timestamp")
        elif event_name in {"execution_success", "execution_error", "execution_interrupted"}:
            prompt_end_ms = payload.get("timestamp")

    node_timings = extract_node_timings(history, prompt)
    if prompt_start_ms is None and node_timings:
        prompt_start_ms = min(
            item["start_ts"]
            for item in node_timings
            if item.get("start_ts") is not None
        )
    if prompt_end_ms is None and node_timings:
        prompt_end_ms = max(
            item["end_ts"]
            for item in node_timings
            if item.get("end_ts") is not None
        )
    node_summary = summarize_node_timings(node_timings)
    return {
        "prompt_status": history.get("status", {}),
        "output_node_ids": sorted(history.get("outputs", {}).keys(), key=lambda value: int(value) if str(value).isdigit() else str(value)),
        "outputs": summarize_outputs(history),
        "node_timings": node_timings,
        "node_summary": node_summary,
        "xpu_summary": summarize_xpu_samples(samples),
        "stage_xpu_summary": summarize_stage_xpu(node_timings, samples, prompt_start_ms, prompt_end_ms),
        "prompt_start_ms": prompt_start_ms,
        "prompt_end_ms": prompt_end_ms,
    }


def stamp_filename_prefixes(prompt: dict, prefix_base: str) -> None:
    counters = defaultdict(int)
    for node_id, node in prompt.items():
        if node.get("class_type") not in OUTPUT_TYPES:
            continue
        counters[node.get("class_type")] += 1
        suffix = f"{node_id}"
        apply_filename_prefix({node_id: node}, f"{prefix_base}-{suffix}")


def main() -> int:
    args = build_parser().parse_args()
    started_at = time.time()
    prompt = load_prompt(args.prompt_json)
    if args.output_node:
        prompt = extract_prompt_subgraph(prompt, args.output_node)
    if args.filename_prefix_base:
        stamp_filename_prefixes(prompt, args.filename_prefix_base)

    run_dir = args.artifact_dir / args.path_id
    run_dir.mkdir(parents=True, exist_ok=True)
    prompt_id = str(uuid.uuid4())
    client_id = str(uuid.uuid4())
    csv_path = run_dir / "xpu.csv"
    prompt_copy_path = run_dir / "prompt.json"
    history_path = run_dir / "history.json"
    report_path = run_dir / "report.json"
    save_json(prompt_copy_path, prompt)

    attempt_record = {
        "timestamp": started_at,
        "path_id": args.path_id,
        "prompt_json": str(args.prompt_json),
        "prompt_copy": str(prompt_copy_path),
        "server": args.server,
        "device": args.device,
        "notes": args.notes,
        "output_nodes": args.output_node or [],
        "filename_prefix_base": args.filename_prefix_base,
        "launch_flags": args.launch_flags,
        "prompt_command": args.prompt_command,
        "prompt_policy": args.prompt_policy,
        "prompt_id": prompt_id,
        "artifact_dir": str(run_dir),
    }

    xpu_stop_event = threading.Event()
    xpu_thread = None
    try:
        xpu_thread = threading.Thread(
            target=xpu_collector,
            args=(csv_path, args.device, args.xpu_sample_seconds, xpu_stop_event),
            daemon=True,
        )
        xpu_thread.start()
        queue_response = queue_prompt(args.server, prompt, prompt_id, client_id)
        history = wait_for_history(args.server, prompt_id, args.poll_interval)
        attempt_record["queue_response"] = queue_response
        attempt_record["status"] = "success"
        save_json(history_path, history)
        xpu_stop_event.set()
        xpu_thread.join(timeout=max(5.0, args.xpu_sample_seconds * 3))
        if xpu_thread.is_alive():
            raise RuntimeError("xpu_collector did not stop before report generation")
        xpu_thread = None
        samples = load_xpu_samples(csv_path)
        report = summarize_history(history, prompt, samples)
        report.update(
            {
                "path_id": args.path_id,
                "prompt_id": prompt_id,
                "notes": args.notes,
                "artifacts": {
                    "prompt_json": str(prompt_copy_path),
                    "history_json": str(history_path),
                    "xpu_csv": str(csv_path),
                },
                "launch_flags": args.launch_flags,
                "prompt_command": args.prompt_command,
                "prompt_policy": args.prompt_policy,
            }
        )
        save_json(report_path, report)
        attempt_record["report_json"] = str(report_path)
        attempt_record["history_status"] = history.get("status", {})
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except Exception as exc:
        attempt_record["status"] = "failed"
        attempt_record["error_type"] = type(exc).__name__
        attempt_record["error"] = str(exc)
        raise
    finally:
        if xpu_thread is not None:
            xpu_stop_event.set()
            xpu_thread.join(timeout=max(5.0, args.xpu_sample_seconds * 3))
            if xpu_thread.is_alive():
                raise RuntimeError("xpu_collector did not stop during cleanup")
        attempt_record["duration_seconds"] = round(time.time() - started_at, 3)
        attempt_record["xpu_csv"] = str(csv_path)
        append_attempt_log(args.attempt_log, attempt_record)
        print(f"attempt_log={args.attempt_log}")


if __name__ == "__main__":
    raise SystemExit(main())
