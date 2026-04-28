import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from script_examples.custom_node_bootstrap_harness import (  # noqa: E402
    build_requirements_command,
    build_startup_command,
    default_startup_package_dir,
    import_module_name,
    merge_pythonpath,
    summarize_startup_output,
)


def test_default_startup_package_dir_strips_disabled_suffix():
    package_dir = Path("/repo/custom_nodes/comfyui-mixlab-nodes.disabled")

    assert default_startup_package_dir(package_dir) == Path("/repo/custom_nodes/comfyui-mixlab-nodes")


def test_build_requirements_command_supports_dry_run():
    command = build_requirements_command("python3", Path("/repo/custom_nodes/pkg/requirements.txt"), "dry-run")

    assert command == [
        "python3",
        "-m",
        "pip",
        "install",
        "--dry-run",
        "-r",
        "/repo/custom_nodes/pkg/requirements.txt",
    ]


def test_import_module_name_normalizes_hyphenated_folder_names():
    module_name = import_module_name(Path("/repo/custom_nodes/comfyui-mixlab-nodes.disabled"), None)

    assert module_name == "comfyui_mixlab_nodes_disabled"


def test_build_startup_command_keeps_quick_test_scope_narrow():
    command = build_startup_command(
        "python3",
        Path("/repo/main.py"),
        "comfyui-mixlab-nodes",
        "127.0.0.1",
        8191,
        "INFO",
        ["--force-non-blocking"],
    )

    assert command == [
        "python3",
        "/repo/main.py",
        "--disable-all-custom-nodes",
        "--whitelist-custom-nodes",
        "comfyui-mixlab-nodes",
        "--quick-test-for-ci",
        "--dont-print-server",
        "--listen",
        "127.0.0.1",
        "--port",
        "8191",
        "--verbose",
        "INFO",
        "--force-non-blocking",
    ]


def test_summarize_startup_output_detects_failed_import_lines():
    output = "\n".join(
        [
            "Import times for custom nodes:",
            "   0.1 seconds (IMPORT FAILED): /repo/custom_nodes/comfyui-mixlab-nodes",
            "Cannot import /repo/custom_nodes/comfyui-mixlab-nodes module for custom nodes: boom",
        ]
    )

    summary = summarize_startup_output(output, "comfyui-mixlab-nodes", Path("/repo/custom_nodes/comfyui-mixlab-nodes"))

    assert summary["import_failed"] is True
    assert summary["cannot_import_lines"] == [
        "Cannot import /repo/custom_nodes/comfyui-mixlab-nodes module for custom nodes: boom"
    ]


def test_merge_pythonpath_prefixes_new_entries_before_existing_env(monkeypatch):
    monkeypatch.setenv("PYTHONPATH", "/env/site-packages")

    merged = merge_pythonpath(Path("/repo/script_examples/bootstrap_hooks"), Path("/repo"))

    assert merged == "/repo/script_examples/bootstrap_hooks:/repo:/env/site-packages"
