# Mixlab CPU-fallback validation checkpoint

Status: `validated`

This checkpoint now records explicit CPU-fallback validation for the Mixlab `Whisper`, `SenseVoice`, and `TripoSR` families in the local repo baseline at `custom_nodes/comfyui-mixlab-nodes.disabled` (`32b22c39cbe13b46df29ef1b6ab088c2eb4389d2`).

## Outcome

CPU-fallback execution is now **locally validated** for the three target families after:

1. bootstrap hardening removed the import-time auto-install blockers
2. runtime dependencies were installed into `.venv-xpu`
3. local model assets were staged under `models/`

Installed runtime dependencies:

- `pyOpenSSL`
- `watchdog`
- `openai`
- `faster-whisper`
- `SenseVoice-python`
- `onnxruntime`
- `trimesh`
- `omegaconf`

Staged local assets:

- `models/whisper/faster-whisper-tiny/{config.json,model.bin,tokenizer.json,vocabulary.txt}`
- `models/sense_voice/{am.mvn,chn_jpn_yue_eng_ko_spectok.bpe.model,embedding.npy,fsmn-am.mvn,fsmn-config.yaml,fsmnvad-offline.onnx,sense-voice-encoder-int8.onnx,asr_example_zh.wav}`
- `models/triposr/model.ckpt`
- `models/triposr/facebook/dino-vitb16/config.json`

## CPU-fallback evidence

### Whisper

- representative nodes: `LoadWhisperModel_` / `WhisperTranscribe_`
- CPU smoke succeeded with local `faster-whisper-tiny`
- evidence: `../cpu-fallback/whisper-smoke.log`

Observed result:

- model loaded on CPU with `compute_type=int8`
- transcription call completed on a 1-second silent waveform
- returned `0` segments and empty text, which is acceptable for this smoke input

### SenseVoice

- representative node: `SenseVoiceNode`
- CPU smoke succeeded with local int8 ONNX assets
- evidence: `../cpu-fallback/sensevoice-smoke.log`

Observed result:

- ONNX session loaded on CPU
- VAD + ASR completed against the upstream example wav
- returned `1` segment with text:
  - `欢迎大家来体验达摩院推出的语音识别模型。`

### TripoSR

- representative nodes: `LoadTripoSRModel_` / `TripoSRSampler_`
- CPU loader smoke succeeded
- CPU sampler smoke succeeded
- evidence:
  - `../cpu-fallback/triposr-loader-smoke.log`
  - `../cpu-fallback/triposr-sampler-smoke.log`

Observed result:

- `LoadTripoSRModel` loaded `model.ckpt` on CPU
- `TripoSRSampler` completed on a simple `128x128` image input
- returned `1` mesh of type `Trimesh`

## Code-path note

`TripoSR` needed one additional local-first patch in `nodes/tsr/models/tokenizers/image.py`:

1. prefer `models/triposr/facebook/dino-vitb16/config.json` when present
2. only fall back to `hf_hub_download(..., endpoint='https://hf-mirror.com')` if the local config is absent

This keeps the CPU-fallback path reproducible in environments where Python-side Hugging Face certificate handling is less reliable than direct file staging.
