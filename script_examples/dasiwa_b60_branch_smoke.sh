#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

WORKFLOW_JSON="${WORKFLOW_JSON:-${REPO_ROOT}/../cartoon/DaSiWa-WAN2.2图生视频流-支持单图_双图_三图出视频json.json}"
OUTPUT_DIR="${OUTPUT_DIR:-${REPO_ROOT}/temp/dasiwa-b60-branch-prompts}"
FORCE_DEVICE_POLICY="${FORCE_DEVICE_POLICY:-cpu-biased}"
STEPS="${STEPS:-8}"
SEED="${SEED:-20260425}"
FILENAME_PREFIX_BASE="${FILENAME_PREFIX_BASE:-dasiwa-b60-smoke}"

mkdir -p "${OUTPUT_DIR}"

for output_node in 54 131 208; do
  save_path="${OUTPUT_DIR}/output-${output_node}.json"
  python3 "${REPO_ROOT}/script_examples/workflow_branch_runner.py" \
    "${WORKFLOW_JSON}" \
    --output-node "${output_node}" \
    --force-device-policy "${FORCE_DEVICE_POLICY}" \
    --steps "${STEPS}" \
    --seed "${SEED}" \
    --filename-prefix "${FILENAME_PREFIX_BASE}-o${output_node}" \
    --save-path "${save_path}"
done

echo "saved_branch_prompts=${OUTPUT_DIR}"
