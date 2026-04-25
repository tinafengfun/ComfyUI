#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

MODEL_ROOT="${MODEL_ROOT:-${REPO_ROOT}/models}"
SHARED_MODEL_ROOT="${SHARED_MODEL_ROOT:-/home/intel/hf_models}"
INPUT_ROOT="${INPUT_ROOT:-${REPO_ROOT}/input}"
EXAMPLE_INPUT="${EXAMPLE_INPUT:-${REPO_ROOT}/../llm-scaler/omni/example_inputs/wan2.2_i2v_input.jpg}"
DOWNLOAD_QWEN_MODELS="${DOWNLOAD_QWEN_MODELS:-1}"

link_if_exists() {
  local source="$1"
  local target="$2"
  if [[ ! -e "${source}" ]]; then
    echo "! missing source: ${source}"
    return 0
  fi
  mkdir -p "$(dirname "${target}")"
  ln -sfn "${source}" "${target}"
  echo "+ ln -sfn ${source} ${target}"
}

copy_if_missing() {
  local source="$1"
  local target="$2"
  if [[ ! -e "${source}" ]]; then
    echo "! missing source: ${source}"
    return 0
  fi
  mkdir -p "$(dirname "${target}")"
  if [[ -e "${target}" ]]; then
    echo "= keep existing ${target}"
    return 0
  fi
  cp "${source}" "${target}"
  echo "+ cp ${source} ${target}"
}

download_qwen_model() {
  local model_name="$1"
  shift
  local files=("$@")
  local dest="${MODEL_ROOT}/prompt_generator/${model_name}"
  local base="https://hf-mirror.com/Qwen/${model_name}/resolve/main"

  mkdir -p "${dest}"
  for file_name in "${files[@]}"; do
    if [[ -s "${dest}/${file_name}" ]]; then
      echo "= keep existing ${dest}/${file_name}"
      continue
    fi
    echo "+ curl -L --fail --output ${dest}/${file_name} ${base}/${file_name}"
    curl -L --fail --output "${dest}/${file_name}" "${base}/${file_name}"
  done
}

echo "==> Staging public workflow assets into ${MODEL_ROOT}"
link_if_exists "${SHARED_MODEL_ROOT}/text_encoders/umt5_xxl_fp16.safetensors" "${MODEL_ROOT}/text_encoders/umt5_xxl_fp16.safetensors"
link_if_exists "${SHARED_MODEL_ROOT}/loras/Wan2.2-Fun-A14B-InP-low-noise-HPS2.1.safetensors" "${MODEL_ROOT}/loras/Wan2.2-Fun-A14B-InP-low-noise-HPS2.1.safetensors"
link_if_exists "${SHARED_MODEL_ROOT}/loras/Wan2.2-Fun-A14B-InP-high-noise-MPS.safetensors" "${MODEL_ROOT}/loras/Wan2.2-Fun-A14B-InP-high-noise-MPS.safetensors"
link_if_exists "${SHARED_MODEL_ROOT}/loras/lightx2v_I2V_14B_480p_cfg_step_distill_rank256_bf16.safetensors" "${MODEL_ROOT}/loras/lightx2v_I2V_14B_480p_cfg_step_distill_rank256_bf16.safetensors"
link_if_exists "${MODEL_ROOT}/unet/WAN2.2/wan2.2_i2v_A14b_high_noise_scaled_fp8_e4m3_lightx2v_4step_comfyui.safetensors" "${MODEL_ROOT}/unet/wan2.2_i2v_A14b_high_noise_scaled_fp8_e4m3_lightx2v_4step_comfyui.safetensors"

echo
echo "==> Installing smoke-only compatibility aliases for unavailable proprietary low-noise UNets"
link_if_exists "${MODEL_ROOT}/unet/WAN2.2/smoothMix_Wan2214B-I2V_i2v_V20_Low.safetensors" "${MODEL_ROOT}/unet/wan22I2VLLSDasiwaNm.low.safetensors"
link_if_exists "${MODEL_ROOT}/unet/WAN2.2/smoothMix_Wan2214B-I2V_i2v_V20_Low.safetensors" "${MODEL_ROOT}/unet/dasiwaWAN22I2V14B_radiantcrushLow.safetensors"

echo
echo "==> Staging workflow input fixtures"
copy_if_missing "${EXAMPLE_INPUT}" "${INPUT_ROOT}/74183b15ad77b23879693ee598e7c829.jpg"
copy_if_missing "${EXAMPLE_INPUT}" "${INPUT_ROOT}/fd58009a5996be7eca0ebd9d07aaeae993215afc92585c235d6474b520f612ef.png"
copy_if_missing "${EXAMPLE_INPUT}" "${INPUT_ROOT}/5b91eb1d97d93b035c50e7c8dd06ce6505482685bf3efc1faa2b34086cb47ad6.png"
copy_if_missing "${EXAMPLE_INPUT}" "${INPUT_ROOT}/7ca01a9571891af904332232d83d3dca68bc9dee109be5606f7476f53859624d.jpg"
copy_if_missing "${EXAMPLE_INPUT}" "${INPUT_ROOT}/eb635abe438eca7a01f0cdff92c3f87cb765c98ac1800596d595ea5cc19b3008.jpg"

if [[ "${DOWNLOAD_QWEN_MODELS}" == "1" ]]; then
  echo
  echo "==> Prefetching Qwen prompt-generator models from hf-mirror"
  download_qwen_model \
    "Qwen3-VL-4B-Instruct-FP8" \
    chat_template.json config.json generation_config.json \
    model-00001-of-00002.safetensors model-00002-of-00002.safetensors \
    model.safetensors.index.json preprocessor_config.json tokenizer.json \
    tokenizer_config.json video_preprocessor_config.json vocab.json
  download_qwen_model \
    "Qwen3-VL-4B-Instruct" \
    chat_template.json config.json generation_config.json merges.txt \
    model-00001-of-00002.safetensors model-00002-of-00002.safetensors \
    model.safetensors.index.json preprocessor_config.json tokenizer.json \
    tokenizer_config.json video_preprocessor_config.json vocab.json
fi
