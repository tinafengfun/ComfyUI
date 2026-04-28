#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ -x "${REPO_ROOT}/.venv-xpu/bin/python" ]]; then
  DEFAULT_PYTHON="${REPO_ROOT}/.venv-xpu/bin/python"
else
  DEFAULT_PYTHON="python3"
fi

PYTHON_BIN="${PYTHON_BIN:-${DEFAULT_PYTHON}}"
PACKAGE_DIR="${PACKAGE_DIR:-${REPO_ROOT}/custom_nodes/comfyui-mixlab-nodes.disabled}"
ARTIFACTS_DIR="${ARTIFACTS_DIR:-${REPO_ROOT}/docs/artifacts/mixlab}"

if [[ "$#" -eq 0 ]]; then
  set -- all --prepare-startup-only
fi

exec "${PYTHON_BIN}" "${REPO_ROOT}/script_examples/custom_node_bootstrap_harness.py" \
  --package-dir "${PACKAGE_DIR}" \
  --artifacts-dir "${ARTIFACTS_DIR}" \
  --package-name mixlab \
  "$@"
