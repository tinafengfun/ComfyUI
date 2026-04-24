#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

WORKFLOW_JSON="${WORKFLOW_JSON:-${REPO_ROOT}/../cartoon/DaSiWa-WAN2.2图生视频流-支持单图_双图_三图出视频json.json}"
SEARCH_ROOT_1="${SEARCH_ROOT_1:-/home/intel/hf_models}"
SEARCH_ROOT_2="${SEARCH_ROOT_2:-/tmp/hf_models}"
CUSTOM_NODES_DIR="${CUSTOM_NODES_DIR:-${REPO_ROOT}/custom_nodes}"
MODEL_ROOT="${MODEL_ROOT:-${REPO_ROOT}/models}"
LINK_MODE="${LINK_MODE:-symlink}"
SEARCH_SOURCES="${SEARCH_SOURCES:-1}"

cd "${REPO_ROOT}"

if [[ "${SEARCH_SOURCES}" == "1" ]]; then
  echo "==> Searching local, remote, and public model sources"
  bash script_examples/dasiwa_b60_search_models.sh
  echo
fi

echo "==> Inventorying workflow assets"
python3 script_examples/workflow_asset_inventory.py \
  "${WORKFLOW_JSON}" \
  --search-root "${SEARCH_ROOT_1}" \
  --search-root "${SEARCH_ROOT_2}"

echo
echo "==> Cloning/updating known custom nodes and staging local models"
python3 script_examples/workflow_asset_setup.py \
  "${WORKFLOW_JSON}" \
  --search-root "${SEARCH_ROOT_1}" \
  --search-root "${SEARCH_ROOT_2}" \
  --custom-nodes-dir "${CUSTOM_NODES_DIR}" \
  --model-root "${MODEL_ROOT}" \
  --clone-custom-nodes \
  --stage-models \
  --link-mode "${LINK_MODE}"

echo
echo "==> Re-checking asset completeness"
python3 script_examples/workflow_asset_inventory.py \
  "${WORKFLOW_JSON}" \
  --search-root "${SEARCH_ROOT_1}" \
  --search-root "${SEARCH_ROOT_2}" \
  --search-root "${MODEL_ROOT}" \
  --strict
