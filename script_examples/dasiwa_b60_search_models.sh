#!/usr/bin/env bash
set -euo pipefail

LOCAL_ROOTS=(
  "${LOCAL_ROOT_1:-/tmp/hf_models}"
  "${LOCAL_ROOT_2:-/home/intel/hf_models}"
)

REMOTE_HOST="${REMOTE_HOST:-172.16.120.116}"
REMOTE_ROOT="${REMOTE_ROOT:-~/lucas/weights/models}"
FETCH_REMOTE="${FETCH_REMOTE:-0}"
FETCH_DEST="${FETCH_DEST:-/home/intel/hf_models}"

BASENAMES=(
  "wan2.2_i2v_A14b_high_noise_scaled_fp8_e4m3_lightx2v_4step_comfyui.safetensors"
  "wan22I2VLLSDasiwaNm.low.safetensors"
  "dasiwaWAN22I2V14B_radiantcrushLow.safetensors"
  "umt5_xxl_fp16.safetensors"
  "Wan2.2-Fun-A14B-InP-high-noise-MPS.safetensors"
  "Wan2.2-Fun-A14B-InP-low-noise-HPS2.1.safetensors"
  "lightx2v_I2V_14B_480p_cfg_step_distill_rank256_bf16.safetensors"
)

urlencode() {
  python3 - "$1" <<'PY'
import sys
from urllib.parse import quote
print(quote(sys.argv[1]))
PY
}

search_terms_for() {
  local name="$1"
  printf '%s\n' "${name}" "${name%.safetensors}"
}

echo "==> Local search roots"
printf '  - %s\n' "${LOCAL_ROOTS[@]}"
echo

for name in "${BASENAMES[@]}"; do
  echo "=== LOCAL: ${name} ==="
  found=0
  for root in "${LOCAL_ROOTS[@]}"; do
    if [[ -d "${root}" ]]; then
      matches="$(find "${root}" -maxdepth 7 -iname "${name}" 2>/dev/null | sort || true)"
      if [[ -n "${matches}" ]]; then
        found=1
        printf '%s\n' "${matches}"
      fi
    fi
  done
  if [[ "${found}" -eq 0 ]]; then
    echo "(not found locally)"
  fi
  echo
done

echo "==> Remote search"
echo "  host: ${REMOTE_HOST}"
echo "  root: ${REMOTE_ROOT}"
echo

if ssh -o BatchMode=yes -o ConnectTimeout=10 "${REMOTE_HOST}" "true" >/dev/null 2>&1; then
  for name in "${BASENAMES[@]}"; do
    echo "=== REMOTE: ${name} ==="
    remote_matches="$(ssh -o BatchMode=yes "${REMOTE_HOST}" "find ${REMOTE_ROOT} -maxdepth 7 -iname '${name}' 2>/dev/null | sort" || true)"
    if [[ -n "${remote_matches}" ]]; then
      printf '%s\n' "${remote_matches}"
      if [[ "${FETCH_REMOTE}" == "1" ]]; then
        while IFS= read -r remote_path; do
          [[ -z "${remote_path}" ]] && continue
          mkdir -p "${FETCH_DEST}"
          echo "scp ${REMOTE_HOST}:${remote_path} -> ${FETCH_DEST}/"
          scp "${REMOTE_HOST}:${remote_path}" "${FETCH_DEST}/"
        done <<< "${remote_matches}"
      fi
    else
      echo "(not found on remote)"
    fi
    echo
  done
else
  echo "Remote SSH access is not currently available. Skipping remote search."
  echo "If credentials are configured later, rerun this script with the same defaults."
  echo
fi

echo "==> Hugging Face + HF mirror search candidates"
python3 - <<'PY'
import json
import subprocess

basenames = [
    "wan2.2_i2v_A14b_high_noise_scaled_fp8_e4m3_lightx2v_4step_comfyui.safetensors",
    "wan22I2VLLSDasiwaNm.low.safetensors",
    "dasiwaWAN22I2V14B_radiantcrushLow.safetensors",
    "umt5_xxl_fp16.safetensors",
    "Wan2.2-Fun-A14B-InP-high-noise-MPS.safetensors",
    "Wan2.2-Fun-A14B-InP-low-noise-HPS2.1.safetensors",
    "lightx2v_I2V_14B_480p_cfg_step_distill_rank256_bf16.safetensors",
]

sources = [
    ("HF", "https://huggingface.co/api/models?search={term}", "https://huggingface.co/models?search={term}"),
    ("HF-MIRROR", "https://hf-mirror.com/api/models?search={term}", "https://www.hf-mirror.com/models?search={term}"),
]

for name in basenames:
    for label, api_template, web_template in sources:
        print(f"=== {label}: {name} ===")
        term = name
        cmd = [
            "curl",
            "-L",
            "--silent",
            "--show-error",
            api_template.format(term=term),
        ]
        try:
            raw = subprocess.check_output(cmd, text=True, timeout=30, stderr=subprocess.DEVNULL)
            items = json.loads(raw)
        except Exception as exc:
            print(f"ERROR: {exc}")
            print(f"fallback: {web_template.format(term=name.removesuffix('.safetensors'))}")
            print()
            continue

        if not items:
            print("(no direct hit)")
            print(f"fallback: {web_template.format(term=name.removesuffix('.safetensors'))}")
            print()
            continue

        for item in items[:5]:
            print(item.get("id"))
        print(f"fallback: {web_template.format(term=name.removesuffix('.safetensors'))}")
        print()
    print()
PY

echo "==> ComfyICU public search candidates"
for name in "${BASENAMES[@]}"; do
  echo "=== COMFY.ICU: ${name} ==="
  found=0
  while IFS= read -r term; do
    encoded="$(urlencode "${term}")"
    response="$(curl -L --silent --show-error "https://comfy.icu/api/v1/search?q=${encoded}&type=models&limit=5" || true)"
    if [[ -n "${response}" && "${response}" != "[]" ]]; then
      found=1
      echo "term=${term}"
      echo "${response}"
    fi
  done < <(search_terms_for "${name}")
  if [[ "${found}" -eq 0 ]]; then
    echo "(no public comfy.icu hit)"
    echo "fallback: https://comfy.icu/search?q=$(urlencode "${name%.safetensors}")"
  fi
  echo
done

echo "==> Civitai search candidates"
for name in "${BASENAMES[@]}"; do
  echo "=== CIVITAI: ${name} ==="
  query="$(urlencode "${name%.safetensors}")"
  api_url="https://civitai.com/api/v1/models?query=${query}&limit=5"
  web_url="https://civitai.com/search/models?query=${query}"
  body="$(curl -L --silent --show-error "${api_url}" 2>/dev/null || true)"
  if [[ -n "${body}" ]]; then
    echo "${body}" | head -c 1200
    echo
  else
    echo "(API unavailable from current network)"
    echo "fallback: ${web_url}"
  fi
  echo
done

echo "==> ModelScope search candidates"
for name in "${BASENAMES[@]}"; do
  echo "=== MODELSCOPE: ${name} ==="
  query="$(urlencode "${name%.safetensors}")"
  url_1="https://www.modelscope.cn/models?name=${query}"
  url_2="https://www.modelscope.cn/search?search=${query}"
  echo "fallback: ${url_1}"
  echo "fallback: ${url_2}"
  echo
done
