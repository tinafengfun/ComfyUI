#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import os
import shlex
import subprocess
import sys
import textwrap
import time
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ARTIFACTS_DIR = REPO_ROOT / "docs" / "artifacts" / "mixlab"
HOOKS_DIR = REPO_ROOT / "script_examples" / "bootstrap_hooks"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Probe custom-node bootstrap behavior: requirements readiness, import behavior, and ComfyUI startup registration."
    )
    parser.add_argument(
        "--package-dir",
        type=Path,
        default=REPO_ROOT / "custom_nodes" / "comfyui-mixlab-nodes",
        help="Path to the custom-node package directory or .py module.",
    )
    parser.add_argument(
        "--package-name",
        default=None,
        help="Optional logical package name. Defaults to the package directory name.",
    )
    parser.add_argument(
        "--artifacts-dir",
        type=Path,
        default=DEFAULT_ARTIFACTS_DIR,
        help="Directory for probe logs and JSON summaries.",
    )
    parser.add_argument(
        "--python-executable",
        default=sys.executable,
        help="Python interpreter used for pip, import, and startup probes.",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    req_parser = subparsers.add_parser("requirements", help="Probe requirements.txt readiness with a dry run or install.")
    req_parser.add_argument(
        "--requirements-file",
        type=Path,
        default=None,
        help="Optional requirements file path. Defaults to <package-dir>/requirements.txt.",
    )
    req_parser.add_argument(
        "--mode",
        choices=["dry-run", "install"],
        default="dry-run",
        help="Use pip install --dry-run (default) or perform a real install.",
    )
    req_parser.add_argument(
        "--pip-check",
        action="store_true",
        help="Run pip check after the requirements probe command succeeds.",
    )

    import_parser = subparsers.add_parser("import", help="Probe isolated Python import behavior for the custom node package.")
    import_parser.add_argument(
        "--allow-side-effects",
        action="store_true",
        help="Allow subprocess/pip side effects during import. Default blocks them and records attempted commands.",
    )
    import_parser.add_argument(
        "--timeout",
        type=float,
        default=120.0,
        help="Timeout in seconds for the isolated import probe.",
    )

    startup_parser = subparsers.add_parser(
        "startup",
        help="Prepare or execute a ComfyUI quick startup/registration probe for a single custom-node package.",
    )
    startup_parser.add_argument(
        "--startup-package-dir",
        type=Path,
        default=None,
        help="Directory name ComfyUI should load. Defaults to --package-dir or a sibling without .disabled.",
    )
    startup_parser.add_argument(
        "--whitelist-name",
        default=None,
        help="Folder name passed to --whitelist-custom-nodes. Defaults to the startup package directory name.",
    )
    startup_parser.add_argument(
        "--main-script",
        type=Path,
        default=REPO_ROOT / "main.py",
        help="Path to ComfyUI main.py.",
    )
    startup_parser.add_argument(
        "--timeout",
        type=float,
        default=180.0,
        help="Timeout in seconds for the quick startup probe.",
    )
    startup_parser.add_argument(
        "--port",
        type=int,
        default=8191,
        help="Port reserved for the startup probe command.",
    )
    startup_parser.add_argument(
        "--listen",
        default="127.0.0.1",
        help="Listen address reserved for the startup probe command.",
    )
    startup_parser.add_argument(
        "--verbose",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
        help="Log level for the ComfyUI startup probe.",
    )
    startup_parser.add_argument(
        "--allow-side-effects",
        action="store_true",
        help="Allow subprocess/pip side effects during ComfyUI startup. Default blocks them and records attempted commands.",
    )
    startup_parser.add_argument(
        "--main-arg",
        action="append",
        default=[],
        help="Extra argument appended verbatim to the main.py probe command.",
    )
    startup_parser.add_argument(
        "--prepare-only",
        action="store_true",
        help="Only write the planned startup probe command and metadata without executing it.",
    )

    all_parser = subparsers.add_parser("all", help="Run requirements, import, and startup probes in sequence.")
    all_parser.add_argument(
        "--requirements-file",
        type=Path,
        default=None,
        help="Optional requirements file path override.",
    )
    all_parser.add_argument(
        "--requirements-mode",
        choices=["dry-run", "install"],
        default="dry-run",
        help="Mode used for the requirements probe.",
    )
    all_parser.add_argument(
        "--pip-check",
        action="store_true",
        help="Run pip check after the requirements probe succeeds.",
    )
    all_parser.add_argument(
        "--import-timeout",
        type=float,
        default=120.0,
        help="Timeout in seconds for the import probe.",
    )
    all_parser.add_argument(
        "--startup-package-dir",
        type=Path,
        default=None,
        help="Directory name ComfyUI should load. Defaults to --package-dir or a sibling without .disabled.",
    )
    all_parser.add_argument(
        "--startup-timeout",
        type=float,
        default=180.0,
        help="Timeout in seconds for the quick startup probe.",
    )
    all_parser.add_argument(
        "--whitelist-name",
        default=None,
        help="Folder name passed to --whitelist-custom-nodes.",
    )
    all_parser.add_argument(
        "--port",
        type=int,
        default=8191,
        help="Port reserved for the startup probe command.",
    )
    all_parser.add_argument(
        "--listen",
        default="127.0.0.1",
        help="Listen address reserved for the startup probe command.",
    )
    all_parser.add_argument(
        "--verbose",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
        help="Log level for the ComfyUI startup probe.",
    )
    all_parser.add_argument(
        "--allow-side-effects",
        action="store_true",
        help="Allow subprocess/pip side effects during import and startup probes.",
    )
    all_parser.add_argument(
        "--prepare-startup-only",
        action="store_true",
        help="Write the startup command and metadata without executing quick-test-for-ci.",
    )
    all_parser.add_argument(
        "--main-arg",
        action="append",
        default=[],
        help="Extra argument appended verbatim to the main.py probe command.",
    )
    return parser


def package_label(package_dir: Path, explicit_name: str | None) -> str:
    return explicit_name or package_dir.name


def import_module_name(package_dir: Path, explicit_name: str | None) -> str:
    raw = package_label(package_dir, explicit_name)
    normalized = "".join(char if char.isalnum() or char == "_" else "_" for char in raw)
    if not normalized:
        normalized = "custom_node_probe"
    if normalized[0].isdigit():
        normalized = f"custom_node_{normalized}"
    return normalized


def requirements_file_for(package_dir: Path, override: Path | None) -> Path:
    return override or (package_dir / "requirements.txt")


def default_startup_package_dir(package_dir: Path) -> Path:
    if package_dir.name.endswith(".disabled"):
        return package_dir.with_name(package_dir.name[: -len(".disabled")])
    return package_dir


def merge_pythonpath(*entries: Path) -> str:
    parts = [str(entry) for entry in entries if entry]
    current = os.environ.get("PYTHONPATH")
    if current:
        parts.append(current)
    return os.pathsep.join(parts)


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def write_text(path: Path, content: str) -> None:
    ensure_dir(path.parent)
    path.write_text(content, encoding="utf-8")


def write_json(path: Path, payload: dict[str, Any]) -> None:
    write_text(path, json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n")


def reset_file(path: Path) -> None:
    if path.exists():
        path.unlink()


def shell_join(command: list[str]) -> str:
    return " ".join(shlex.quote(part) for part in command)


def default_probe_paths(artifacts_dir: Path, probe_name: str) -> dict[str, Path]:
    base = ensure_dir(artifacts_dir)
    return {
        "log": base / f"{probe_name}-probe.log",
        "summary": base / f"{probe_name}-probe.json",
        "side_effects": base / f"{probe_name}-side-effects.jsonl",
    }


def build_requirements_command(python_executable: str, requirements_file: Path, mode: str) -> list[str]:
    if mode == "dry-run":
        return [python_executable, "-m", "pip", "install", "--dry-run", "-r", str(requirements_file)]
    if mode == "install":
        return [python_executable, "-m", "pip", "install", "-r", str(requirements_file)]
    raise ValueError(f"Unsupported requirements probe mode: {mode}")


def run_subprocess(
    command: list[str],
    *,
    cwd: Path,
    env: dict[str, str] | None = None,
    timeout: float | None = None,
) -> dict[str, Any]:
    started = time.time()
    try:
        completed = subprocess.run(
            command,
            cwd=str(cwd),
            env=env,
            capture_output=True,
            text=True,
            errors="replace",
            timeout=timeout,
            check=False,
        )
        return {
            "returncode": completed.returncode,
            "stdout": completed.stdout,
            "stderr": completed.stderr,
            "timed_out": False,
            "duration_seconds": round(time.time() - started, 3),
        }
    except subprocess.TimeoutExpired as exc:
        return {
            "returncode": None,
            "stdout": exc.stdout or "",
            "stderr": exc.stderr or "",
            "timed_out": True,
            "duration_seconds": round(time.time() - started, 3),
            "error": f"Command timed out after {timeout} seconds",
        }


def format_command_log(command: list[str], result: dict[str, Any]) -> str:
    sections = [f"$ {shell_join(command)}"]
    stdout = result.get("stdout") or ""
    stderr = result.get("stderr") or ""
    if stdout:
        sections.append("[stdout]\n" + stdout.rstrip())
    if stderr:
        sections.append("[stderr]\n" + stderr.rstrip())
    if result.get("timed_out"):
        sections.append(result.get("error", "timed_out=true"))
    sections.append(f"returncode={result.get('returncode')}")
    sections.append(f"duration_seconds={result.get('duration_seconds')}")
    return "\n\n".join(sections).rstrip() + "\n"


def env_with_side_effect_guard(side_effect_log: Path, allow_side_effects: bool) -> dict[str, str]:
    env = os.environ.copy()
    env["PYTHONPATH"] = merge_pythonpath(HOOKS_DIR, REPO_ROOT)
    env["COMFY_BOOTSTRAP_SIDE_EFFECT_LOG"] = str(side_effect_log)
    env["COMFY_BOOTSTRAP_BLOCK_SIDE_EFFECTS"] = "0" if allow_side_effects else "1"
    env["PYTHONUNBUFFERED"] = "1"
    return env


def build_import_command(python_executable: str, package_dir: Path, package_name: str, summary_path: Path) -> list[str]:
    script = textwrap.dedent(
        """
        import importlib.util
        import json
        import sys
        import traceback
        from pathlib import Path

        package_dir = Path(sys.argv[1]).resolve()
        package_name = sys.argv[2]
        summary_path = Path(sys.argv[3]).resolve()

        summary = {
            "probe": "import",
            "package_dir": str(package_dir),
            "package_name": package_name,
        }

        try:
            if package_dir.is_dir():
                init_file = package_dir / "__init__.py"
                if not init_file.exists():
                    raise FileNotFoundError(f"Missing __init__.py: {init_file}")
                spec = importlib.util.spec_from_file_location(
                    package_name,
                    str(init_file),
                    submodule_search_locations=[str(package_dir)],
                )
            elif package_dir.is_file():
                spec = importlib.util.spec_from_file_location(package_name, str(package_dir))
            else:
                raise FileNotFoundError(f"Package path does not exist: {package_dir}")

            if spec is None or spec.loader is None:
                raise ImportError(f"Unable to create import spec for {package_dir}")

            module = importlib.util.module_from_spec(spec)
            sys.modules[package_name] = module
            spec.loader.exec_module(module)
            node_class_mappings = getattr(module, "NODE_CLASS_MAPPINGS", None)
            summary.update(
                {
                    "ok": True,
                    "status": "success",
                    "module_file": getattr(module, "__file__", None),
                    "node_class_count": len(node_class_mappings) if isinstance(node_class_mappings, dict) else None,
                    "web_directory": getattr(module, "WEB_DIRECTORY", None),
                }
            )
        except BaseException as exc:  # noqa: BLE001
            summary.update(
                {
                    "ok": False,
                    "status": "failed",
                    "error_type": type(exc).__name__,
                    "error": str(exc),
                    "traceback": traceback.format_exc(),
                }
            )
        summary_path.parent.mkdir(parents=True, exist_ok=True)
        summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True) + "\\n", encoding="utf-8")
        print(json.dumps(summary, ensure_ascii=False))
        raise SystemExit(0 if summary.get("ok") else 1)
        """
    ).strip()
    return [python_executable, "-c", script, str(package_dir), package_name, str(summary_path)]


def build_startup_command(
    python_executable: str,
    main_script: Path,
    whitelist_name: str,
    listen: str,
    port: int,
    verbose: str,
    extra_args: list[str],
) -> list[str]:
    return [
        python_executable,
        str(main_script),
        "--disable-all-custom-nodes",
        "--whitelist-custom-nodes",
        whitelist_name,
        "--quick-test-for-ci",
        "--dont-print-server",
        "--listen",
        listen,
        "--port",
        str(port),
        "--verbose",
        verbose,
        *extra_args,
    ]


def summarize_startup_output(output: str, whitelist_name: str, startup_package_dir: Path) -> dict[str, Any]:
    tracked_tokens = {whitelist_name, str(startup_package_dir)}
    matched_lines = [line for line in output.splitlines() if any(token in line for token in tracked_tokens)]
    import_failed = any("IMPORT FAILED" in line for line in matched_lines)
    prestartup_failed = any("PRESTARTUP FAILED" in line for line in matched_lines)
    skipped = any("Skipping" in line and whitelist_name in line for line in output.splitlines())
    cannot_import_lines = [
        line
        for line in output.splitlines()
        if "Cannot import" in line and any(token in line for token in tracked_tokens)
    ]
    return {
        "matched_lines": matched_lines[-20:],
        "import_failed": import_failed,
        "prestartup_failed": prestartup_failed,
        "skipped": skipped,
        "cannot_import_lines": cannot_import_lines[-10:],
    }


def probe_requirements(args: argparse.Namespace) -> tuple[dict[str, Any], int]:
    paths = default_probe_paths(args.artifacts_dir, "requirements")
    reset_file(paths["side_effects"])
    package_dir = args.package_dir.resolve()
    requirements_file = requirements_file_for(package_dir, args.requirements_file).resolve()
    summary: dict[str, Any] = {
        "probe": "requirements",
        "package_dir": str(package_dir),
        "package_name": package_label(package_dir, args.package_name),
        "requirements_file": str(requirements_file),
        "mode": args.mode,
        "log_path": str(paths["log"]),
        "summary_path": str(paths["summary"]),
    }

    if not requirements_file.exists():
        summary.update({"ok": True, "status": "no-requirements-file", "pip_check": False})
        write_text(paths["log"], f"No requirements.txt found at {requirements_file}\n")
        write_json(paths["summary"], summary)
        return summary, 0

    command = build_requirements_command(args.python_executable, requirements_file, args.mode)
    result = run_subprocess(command, cwd=REPO_ROOT)
    log_parts = [format_command_log(command, result)]
    summary.update(
        {
            "command": command,
            "command_text": shell_join(command),
            "returncode": result["returncode"],
            "timed_out": result["timed_out"],
            "duration_seconds": result["duration_seconds"],
            "ok": result["returncode"] == 0 and not result["timed_out"],
            "status": "success" if result["returncode"] == 0 and not result["timed_out"] else "failed",
        }
    )

    pip_check_result = None
    if summary["ok"] and args.pip_check:
        pip_check_command = [args.python_executable, "-m", "pip", "check"]
        pip_check_result = run_subprocess(pip_check_command, cwd=REPO_ROOT)
        log_parts.append(format_command_log(pip_check_command, pip_check_result))
        summary["pip_check"] = {
            "command": pip_check_command,
            "command_text": shell_join(pip_check_command),
            "returncode": pip_check_result["returncode"],
            "timed_out": pip_check_result["timed_out"],
            "duration_seconds": pip_check_result["duration_seconds"],
            "ok": pip_check_result["returncode"] == 0 and not pip_check_result["timed_out"],
        }
        if not summary["pip_check"]["ok"]:
            summary["ok"] = False
            summary["status"] = "failed"
    else:
        summary["pip_check"] = False

    write_text(paths["log"], "\n".join(log_parts))
    write_json(paths["summary"], summary)
    exit_code = 0 if summary["ok"] else 1
    return summary, exit_code


def probe_import(args: argparse.Namespace) -> tuple[dict[str, Any], int]:
    paths = default_probe_paths(args.artifacts_dir, "import")
    reset_file(paths["summary"])
    reset_file(paths["side_effects"])
    package_dir = args.package_dir.resolve()
    package_name = package_label(package_dir, args.package_name)
    module_name = import_module_name(package_dir, args.package_name)
    command = build_import_command(args.python_executable, package_dir, module_name, paths["summary"])
    env = env_with_side_effect_guard(paths["side_effects"], args.allow_side_effects)
    result = run_subprocess(command, cwd=REPO_ROOT, env=env, timeout=args.timeout)
    write_text(paths["log"], format_command_log(command, result))

    if paths["summary"].exists():
        summary = json.loads(paths["summary"].read_text(encoding="utf-8"))
    else:
        summary = {
            "probe": "import",
            "package_dir": str(package_dir),
            "package_name": package_name,
            "import_module_name": module_name,
            "ok": False,
            "status": "failed",
            "error": "Import probe did not produce a summary file.",
        }

    summary.update(
        {
            "command": command,
            "command_text": shell_join(command),
            "log_path": str(paths["log"]),
            "summary_path": str(paths["summary"]),
            "side_effect_log_path": str(paths["side_effects"]),
            "package_name": package_name,
            "import_module_name": module_name,
            "returncode": result["returncode"],
            "timed_out": result["timed_out"],
            "duration_seconds": result["duration_seconds"],
            "side_effect_guard_enabled": not args.allow_side_effects,
        }
    )
    if result["timed_out"]:
        summary.update({"ok": False, "status": "failed", "error": result.get("error")})
    write_json(paths["summary"], summary)
    exit_code = 0 if summary.get("ok") else 1
    return summary, exit_code


def probe_startup(args: argparse.Namespace) -> tuple[dict[str, Any], int]:
    paths = default_probe_paths(args.artifacts_dir, "startup")
    reset_file(paths["side_effects"])
    package_dir = args.package_dir.resolve()
    startup_package_dir = (args.startup_package_dir or default_startup_package_dir(package_dir)).resolve()
    whitelist_name = args.whitelist_name or startup_package_dir.name
    command = build_startup_command(
        args.python_executable,
        args.main_script.resolve(),
        whitelist_name,
        args.listen,
        args.port,
        args.verbose,
        args.main_arg,
    )
    summary: dict[str, Any] = {
        "probe": "startup",
        "package_dir": str(package_dir),
        "startup_package_dir": str(startup_package_dir),
        "whitelist_name": whitelist_name,
        "command": command,
        "command_text": shell_join(command),
        "log_path": str(paths["log"]),
        "summary_path": str(paths["summary"]),
        "side_effect_log_path": str(paths["side_effects"]),
        "ready_to_run": startup_package_dir.exists(),
        "prepare_only": args.prepare_only,
        "side_effect_guard_enabled": not args.allow_side_effects,
    }

    if args.prepare_only or not startup_package_dir.exists():
        summary.update(
            {
                "ok": True,
                "status": "prepared",
                "note": "Startup probe command prepared but not executed."
                if args.prepare_only
                else "Startup package directory is not present; command prepared for later execution.",
            }
        )
        log_lines = [
            f"startup_package_dir={startup_package_dir}",
            f"ready_to_run={summary['ready_to_run']}",
            f"prepare_only={args.prepare_only}",
            f"$ {summary['command_text']}",
        ]
        write_text(paths["log"], "\n".join(log_lines) + "\n")
        write_json(paths["summary"], summary)
        return summary, 0

    env = env_with_side_effect_guard(paths["side_effects"], args.allow_side_effects)
    result = run_subprocess(command, cwd=REPO_ROOT, env=env, timeout=args.timeout)
    output = (result.get("stdout") or "") + ("\n" if result.get("stdout") and result.get("stderr") else "") + (result.get("stderr") or "")
    startup_summary = summarize_startup_output(output, whitelist_name, startup_package_dir)
    summary.update(startup_summary)
    summary.update(
        {
            "returncode": result["returncode"],
            "timed_out": result["timed_out"],
            "duration_seconds": result["duration_seconds"],
            "ok": result["returncode"] == 0 and not result["timed_out"] and not startup_summary["import_failed"] and not startup_summary["prestartup_failed"],
            "status": "success"
            if result["returncode"] == 0 and not result["timed_out"] and not startup_summary["import_failed"] and not startup_summary["prestartup_failed"]
            else "failed",
        }
    )
    write_text(paths["log"], format_command_log(command, result))
    write_json(paths["summary"], summary)
    exit_code = 0 if summary["ok"] else 1
    return summary, exit_code


def run_all(args: argparse.Namespace) -> tuple[dict[str, Any], int]:
    summaries: dict[str, Any] = {}
    exit_codes: list[int] = []

    req_args = argparse.Namespace(
        package_dir=args.package_dir,
        package_name=args.package_name,
        artifacts_dir=args.artifacts_dir,
        python_executable=args.python_executable,
        requirements_file=args.requirements_file,
        mode=args.requirements_mode,
        pip_check=args.pip_check,
    )
    summaries["requirements"], req_code = probe_requirements(req_args)
    exit_codes.append(req_code)

    import_args = argparse.Namespace(
        package_dir=args.package_dir,
        package_name=args.package_name,
        artifacts_dir=args.artifacts_dir,
        python_executable=args.python_executable,
        allow_side_effects=args.allow_side_effects,
        timeout=args.import_timeout,
    )
    summaries["import"], import_code = probe_import(import_args)
    exit_codes.append(import_code)

    startup_args = argparse.Namespace(
        package_dir=args.package_dir,
        package_name=args.package_name,
        artifacts_dir=args.artifacts_dir,
        python_executable=args.python_executable,
        startup_package_dir=args.startup_package_dir,
        whitelist_name=args.whitelist_name,
        main_script=REPO_ROOT / "main.py",
        timeout=args.startup_timeout,
        port=args.port,
        listen=args.listen,
        verbose=args.verbose,
        allow_side_effects=args.allow_side_effects,
        main_arg=args.main_arg,
        prepare_only=args.prepare_startup_only,
    )
    summaries["startup"], startup_code = probe_startup(startup_args)
    exit_codes.append(startup_code)

    overall = {
        "probe": "all",
        "package_dir": str(args.package_dir.resolve()),
        "package_name": package_label(args.package_dir.resolve(), args.package_name),
        "artifacts_dir": str(args.artifacts_dir.resolve()),
        "ok": all(code == 0 for code in exit_codes),
        "results": summaries,
    }
    write_json(args.artifacts_dir.resolve() / "bootstrap-summary.json", overall)
    return overall, 0 if overall["ok"] else 1


def main() -> int:
    args = build_parser().parse_args()
    args.artifacts_dir = args.artifacts_dir.resolve()
    ensure_dir(args.artifacts_dir)

    if args.command == "requirements":
        summary, exit_code = probe_requirements(args)
    elif args.command == "import":
        summary, exit_code = probe_import(args)
    elif args.command == "startup":
        summary, exit_code = probe_startup(args)
    elif args.command == "all":
        summary, exit_code = run_all(args)
    else:
        raise ValueError(f"Unknown command: {args.command}")

    print(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True))
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
