#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PATCH_ROOT="${PATCH_ROOT:-${REPO_ROOT}/patches/dasiwa-b60}"
CUSTOM_NODES_DIR="${CUSTOM_NODES_DIR:-${REPO_ROOT}/custom_nodes}"

apply_repo_patch() {
  local repo_name="$1"
  local patch_name="$2"
  local repo_dir="${CUSTOM_NODES_DIR}/${repo_name}"
  local patch_file="${PATCH_ROOT}/${patch_name}"

  if [[ ! -d "${repo_dir}" ]]; then
    echo "! missing custom-node repo: ${repo_dir}"
    return 0
  fi

  if git -C "${repo_dir}" apply --reverse --check "${patch_file}" >/dev/null 2>&1; then
    echo "= already applied ${patch_name}"
    return 0
  fi

  echo "+ git -C ${repo_dir} apply ${patch_file}"
  git -C "${repo_dir}" apply "${patch_file}"
}

apply_repo_patch "ComfyUI-LaoLi-lineup" "ComfyUI-LaoLi-lineup.patch"
apply_repo_patch "ComfyUI-Easy-Use" "ComfyUI-Easy-Use.patch"
apply_repo_patch "ComfyUI_Qwen3-VL-Instruct" "ComfyUI_Qwen3-VL-Instruct.patch"
