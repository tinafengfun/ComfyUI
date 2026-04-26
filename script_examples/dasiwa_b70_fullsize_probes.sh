#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

WORKFLOW_JSON="${WORKFLOW_JSON:-${REPO_ROOT}/../cartoon/DaSiWa-WAN2.2图生视频流-支持单图 _ 双图 _ 三图 出视频-B70.json}"
SERVER="${SERVER:-127.0.0.1:8188}"
OUTPUT_ROOT="${OUTPUT_ROOT:-${REPO_ROOT}/docs/artifacts/b70}"
STEPS="${STEPS:-8}"
SEED="${SEED:-20260425}"

mkdir -p "${OUTPUT_ROOT}/prompts" "${OUTPUT_ROOT}/logs"

python3 "${REPO_ROOT}/script_examples/workflow_branch_runner.py" \
  "${WORKFLOW_JSON}" \
  --output-node 54 \
  --force-device-policy cpu-biased \
  --steps "${STEPS}" \
  --seed "${SEED}" \
  --filename-prefix "dasiwa-b70-fullsize-o54" \
  --set-input "73.image=74183b15ad77b23879693ee598e7c829.jpg" \
  --save-path "${OUTPUT_ROOT}/prompts/branch-54-fullsize.json" \
  --submit \
  --server "${SERVER}" | tee "${OUTPUT_ROOT}/logs/branch-54-fullsize.log"

python3 "${REPO_ROOT}/script_examples/workflow_branch_runner.py" \
  "${WORKFLOW_JSON}" \
  --output-node 208 \
  --force-device-policy cpu-biased \
  --steps "${STEPS}" \
  --seed "${SEED}" \
  --filename-prefix "dasiwa-b70-fullsize-o208" \
  --save-path "${OUTPUT_ROOT}/prompts/branch-208-fullsize.json" \
  --submit \
  --server "${SERVER}" | tee "${OUTPUT_ROOT}/logs/branch-208-fullsize.log"
