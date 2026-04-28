from __future__ import annotations

import json
import os
import subprocess
import time
from pathlib import Path
from typing import Any

BLOCK = os.environ.get("COMFY_BOOTSTRAP_BLOCK_SIDE_EFFECTS") == "1"
SIDE_EFFECT_LOG = os.environ.get("COMFY_BOOTSTRAP_SIDE_EFFECT_LOG")

if BLOCK and SIDE_EFFECT_LOG:
    log_path = Path(SIDE_EFFECT_LOG)

    def append_event(kind: str, payload: dict[str, Any]) -> None:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        event = {
            "timestamp": round(time.time(), 3),
            "kind": kind,
            **payload,
        }
        with log_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(event, ensure_ascii=False) + "\n")

    def normalize_command(command: Any) -> Any:
        if isinstance(command, (list, tuple)):
            return [str(item) for item in command]
        return str(command)

    def block_call(kind: str, command: Any) -> None:
        normalized = normalize_command(command)
        append_event(kind, {"command": normalized})
        raise RuntimeError(f"Blocked bootstrap side effect via {kind}: {normalized}")

    original_run = subprocess.run
    original_popen = subprocess.Popen
    original_check_call = subprocess.check_call
    original_check_output = subprocess.check_output
    original_system = os.system

    def guarded_run(*args, **kwargs):
        command = args[0] if args else kwargs.get("args")
        block_call("subprocess.run", command)

    class GuardedPopen:  # pylint: disable=too-few-public-methods
        def __init__(self, command, *args, **kwargs):
            block_call("subprocess.Popen", command)

    def guarded_check_call(*args, **kwargs):
        command = args[0] if args else kwargs.get("args")
        block_call("subprocess.check_call", command)

    def guarded_check_output(*args, **kwargs):
        command = args[0] if args else kwargs.get("args")
        block_call("subprocess.check_output", command)

    def guarded_system(command):
        block_call("os.system", command)

    subprocess.run = guarded_run
    subprocess.Popen = GuardedPopen
    subprocess.check_call = guarded_check_call
    subprocess.check_output = guarded_check_output
    os.system = guarded_system

    try:
        import pip  # noqa: PLC0415
    except Exception:  # noqa: BLE001
        pip = None
    if pip is not None and hasattr(pip, "main"):
        def guarded_pip_main(*args, **kwargs):
            block_call("pip.main", list(args) if args else kwargs)
        pip.main = guarded_pip_main
