#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import uuid
from pathlib import Path
from urllib import error, request

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from script_examples.workflow_to_prompt import FORCED_INPUT_DEFAULTS, workflow_to_prompt
from utils.prompt_subgraph import apply_filename_prefix, apply_sampler_overrides, extract_prompt_subgraph


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def detect_input_format(payload: dict) -> str:
    if isinstance(payload, dict) and "nodes" in payload and "links" in payload:
        return "workflow"
    return "prompt"


def forced_defaults_for_policy(force_policy: str) -> dict:
    if force_policy == "none":
        return {
            key: value
            for key, value in FORCED_INPUT_DEFAULTS.items()
            if key in {"PathchSageAttentionKJ", "ModelPatchTorchSettings"}
        }
    return FORCED_INPUT_DEFAULTS


def prepare_prompt(payload: dict, force_policy: str) -> tuple[dict, str]:
    payload_format = detect_input_format(payload)
    if payload_format == "workflow":
        return workflow_to_prompt(payload, forced_defaults=forced_defaults_for_policy(force_policy)), payload_format
    return payload, payload_format


def save_prompt(path: Path, prompt: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(prompt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def parse_override_value(raw: str):
    value = raw.strip()
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value


def apply_input_overrides(prompt: dict, overrides: list[str]) -> dict:
    for override in overrides:
        target, separator, raw_value = override.partition("=")
        if not separator:
            raise ValueError(f"Invalid override '{override}': expected NODE_ID.INPUT_NAME=VALUE")
        node_id, dot, input_name = target.partition(".")
        if not dot or not node_id or not input_name:
            raise ValueError(f"Invalid override '{override}': expected NODE_ID.INPUT_NAME=VALUE")
        if node_id not in prompt:
            raise KeyError(f"Node '{node_id}' not found in prompt")
        prompt[node_id].setdefault("inputs", {})[input_name] = parse_override_value(raw_value)
    return prompt


def default_attempt_log() -> Path:
    override = os.environ.get("COMFY_MIGRATION_ATTEMPT_LOG")
    if override:
        return Path(override)
    return REPO_ROOT / "temp" / "migration_attempts.jsonl"


def append_attempt_log(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")


def fetch_json(url: str) -> dict:
    with request.urlopen(url) as response:
        return json.loads(response.read())


def queue_prompt(server_address: str, prompt: dict, prompt_id: str, client_id: str) -> None:
    payload = {"prompt": prompt, "prompt_id": prompt_id, "client_id": client_id}
    data = json.dumps(payload).encode("utf-8")
    req = request.Request(f"http://{server_address}/prompt", data=data)
    with request.urlopen(req) as response:
        response.read()


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


def summarize_history(history: dict) -> dict:
    outputs = history.get("outputs", {})
    status = history.get("status", {})
    return {
        "output_node_ids": sorted(outputs.keys(), key=lambda value: int(value) if str(value).isdigit() else str(value)),
        "status_keys": sorted(status.keys()),
        "has_outputs": bool(outputs),
        "has_error": "error" in status or bool(history.get("exception")),
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Extract a single output branch from a workflow JSON or API prompt and optionally submit it to ComfyUI."
    )
    parser.add_argument("prompt_json", type=Path, help="Path to a ComfyUI workflow JSON export or API prompt JSON file.")
    parser.add_argument("--output-node", required=True, help="The output node id to isolate, for example 408.")
    parser.add_argument("--save-path", type=Path, help="Optional path to write the extracted subgraph prompt.")
    parser.add_argument("--steps", type=int, help="Override all KSampler/KSamplerAdvanced steps in the branch.")
    parser.add_argument("--seed", type=int, help="Override all sampler seeds in the branch.")
    parser.add_argument("--filename-prefix", help="Override filename_prefix for save/output nodes in the branch.")
    parser.add_argument(
        "--set-input",
        action="append",
        default=[],
        metavar="NODE_ID.INPUT_NAME=VALUE",
        help="Override a prompt input without editing the source workflow, for example --set-input 51.Number=512.",
    )
    parser.add_argument(
        "--force-device-policy",
        choices=["cpu-biased", "none"],
        default="cpu-biased",
        help="Apply migration-oriented forced defaults when the input is a workflow JSON. 'none' preserves workflow loader device settings while still keeping the KJ safety overrides.",
    )
    parser.add_argument(
        "--no-force-cpu",
        action="store_true",
        help="Shortcut for --force-device-policy none.",
    )
    parser.add_argument("--submit", action="store_true", help="Submit the extracted prompt to a live ComfyUI server.")
    parser.add_argument("--server", default="127.0.0.1:8188", help="ComfyUI host:port, default 127.0.0.1:8188.")
    parser.add_argument("--poll-interval", type=float, default=2.0, help="History polling interval in seconds.")
    parser.add_argument("--attempt-log", type=Path, default=default_attempt_log(), help="JSONL file that records every attempt.")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    force_policy = "none" if args.no_force_cpu else args.force_device_policy
    started_at = time.time()
    attempt_record = {
        "timestamp": started_at,
        "prompt_json": str(args.prompt_json),
        "output_node": str(args.output_node),
        "submit": args.submit,
        "server": args.server if args.submit else None,
        "save_path": str(args.save_path) if args.save_path else None,
        "steps": args.steps,
        "seed": args.seed,
        "filename_prefix": args.filename_prefix,
        "set_input": args.set_input,
        "force_device_policy": force_policy,
    }

    try:
        full_payload = load_json(args.prompt_json)
        full_prompt, payload_format = prepare_prompt(full_payload, force_policy)
        attempt_record["input_format"] = payload_format
        branch_prompt = extract_prompt_subgraph(full_prompt, [args.output_node])

        if args.steps is not None or args.seed is not None:
            apply_sampler_overrides(branch_prompt, steps=args.steps, seed=args.seed)
        if args.filename_prefix:
            apply_filename_prefix(branch_prompt, args.filename_prefix)
        if args.set_input:
            apply_input_overrides(branch_prompt, args.set_input)

        summary = {
            "output_node": str(args.output_node),
            "nodes": len(branch_prompt),
            "samplers": sorted(
                node_id
                for node_id, node in branch_prompt.items()
                if node.get("class_type") in {"KSampler", "KSamplerAdvanced"}
            ),
        }
        attempt_record["branch_summary"] = summary
        print(json.dumps(summary, ensure_ascii=False))

        if args.save_path:
            save_prompt(args.save_path, branch_prompt)
            attempt_record["saved_prompt"] = str(args.save_path)
            print(f"saved_prompt={args.save_path}")

        if not args.submit:
            attempt_record["status"] = "prepared"
            return 0

        prompt_id = str(uuid.uuid4())
        client_id = str(uuid.uuid4())
        attempt_record["prompt_id"] = prompt_id
        queue_prompt(args.server, branch_prompt, prompt_id, client_id)
        print(f"queued_prompt_id={prompt_id}")

        history = wait_for_history(args.server, prompt_id, args.poll_interval)
        attempt_record["status"] = "success"
        attempt_record["history_summary"] = summarize_history(history)
        print(json.dumps(history, ensure_ascii=False, indent=2))
        return 0
    except Exception as exc:
        attempt_record["status"] = "failed"
        attempt_record["error_type"] = type(exc).__name__
        attempt_record["error"] = str(exc)
        raise
    finally:
        attempt_record["duration_seconds"] = round(time.time() - started_at, 3)
        append_attempt_log(args.attempt_log, attempt_record)
        print(f"attempt_log={args.attempt_log}")


if __name__ == "__main__":
    raise SystemExit(main())
