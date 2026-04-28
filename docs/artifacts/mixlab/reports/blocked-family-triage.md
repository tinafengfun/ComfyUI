# Mixlab blocked-family triage

Target families: `Rembg`, `MiniCPM`, and `FishSpeech` in `custom_nodes/comfyui-mixlab-nodes.disabled`.

## Summary

| Family | Current blocked reason | Evidence |
| --- | --- | --- |
| `Rembg` | import path can shell out to `pip install rembg[gpu]`; BRIA path is still CUDA-only | `logs/rembg-import-guard.log`, `logs/rembg-import-side-effects.jsonl`, `nodes/RembgNode.py:510-517`, `:547-571` |
| `MiniCPM` | no XPU path; CPU/unload path still executes CUDA cleanup and crashes | `logs/minicpm-constructor-probe.log`, `logs/minicpm-cpu-unload-probe.log`, `logs/torch-cuda-api-probe.log`, `nodes/MiniCPMNode.py:24-30`, `:72-80`, `:149-155` |
| `FishSpeech` | vendored package import is broken before runtime; after namespace aliasing it still requires missing `hydra`; exposed runtime devices remain `cuda`/`cpu` only | `logs/fishspeech-import-probe.log`, `logs/fishspeech-import-alias-probe.log`, `nodes/FishSpeech.py:36-39`, `:79`, `:157-161`, `:231`, `nodes/fish_speech/models/text2semantic/llama.py:18-19`, `nodes/fish_speech/utils/instantiators.py:3`, `nodes/fish_speech/llama_utils.py:27-30`, `:58-67`, `nodes/fish_speech/vqgan_utils.py:10-18`, `:32` |

## Family notes

### 1. `Rembg`

- Source import guard calls `subprocess.run([sys.executable, "-s", "-m", "pip", "install", "rembg[gpu]"])` when `find_spec("rembg")` is false (`nodes/RembgNode.py:510-517`).
- Guarded import probe forced that branch and recorded the attempted side effect:
  - signature: `Blocked bootstrap side effect via subprocess.run: ["/home/intel/tianfeng/comfy/ComfyUI/.venv-xpu/bin/python", "-s", "-m", "pip", "install", "rembg[gpu]"]`
  - artifact: `docs/artifacts/mixlab/logs/rembg-import-side-effects.jsonl`
- Even after import, `_available` remains false in the guarded probe (`docs/artifacts/mixlab/logs/rembg-import-guard.log`), so registration still depends on environment state.
- Runtime BRIA path still hard-codes CUDA promotion (`net=net.cuda()`, `im_tensor=im_tensor.cuda()`) in `nodes/RembgNode.py:547-571`.

Minimal reproduction:

```bash
cd /home/intel/tianfeng/comfy/ComfyUI
PYTHONPATH="$PWD/script_examples/bootstrap_hooks:$PWD" \
COMFY_BOOTSTRAP_BLOCK_SIDE_EFFECTS=1 \
COMFY_BOOTSTRAP_SIDE_EFFECT_LOG="$PWD/docs/artifacts/mixlab/logs/rembg-import-side-effects.jsonl" \
.venv-xpu/bin/python - <<'PY'
import importlib.util
orig_find_spec = importlib.util.find_spec
importlib.util.find_spec = lambda name, package=None: None if name == "rembg" else orig_find_spec(name, package)
spec = importlib.util.spec_from_file_location("mixlab_rembg_probe", "custom_nodes/comfyui-mixlab-nodes.disabled/nodes/RembgNode.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
print(mod._available)
PY
```

### 2. `MiniCPM`

- Constructor only selects `torch.device("cuda")` or `torch.device("cpu")`; there is no XPU selector (`nodes/MiniCPMNode.py:24-30`).
- Constructor probe in the current XPU venv resolves to:
  - `device: "cpu"`
  - `bf16_support: false`
  - artifact: `docs/artifacts/mixlab/logs/minicpm-constructor-probe.log`
- The node also auto-downloads `openbmb/MiniCPM-V-2_6-int4` if the local checkpoint folder is absent (`nodes/MiniCPMNode.py:72-80`).
- More importantly, unload cleanup is unconditional CUDA cleanup:
  - `torch.cuda.empty_cache()`
  - `torch.cuda.ipc_collect()`
  - source: `nodes/MiniCPMNode.py:149-155`
- Reproduced failure with a mocked model/tokenizer on the CPU path:
  - signature: `AssertionError: Torch not compiled with CUDA enabled`
  - throwing frame: `torch.cuda.ipc_collect()`
  - artifact: `docs/artifacts/mixlab/logs/minicpm-cpu-unload-probe.log`
- Supporting probe shows `torch.cuda.ipc_collect()` and `torch.cuda.synchronize()` do fail in this build when CUDA is unavailable (`docs/artifacts/mixlab/logs/torch-cuda-api-probe.log`).

Minimal reproduction:

```bash
cd /home/intel/tianfeng/comfy/ComfyUI
.venv-xpu/bin/python - <<'PY'
import importlib.util, torch
spec = importlib.util.spec_from_file_location("mixlab_minicpm_probe", "custom_nodes/comfyui-mixlab-nodes.disabled/nodes/MiniCPMNode.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
node = mod.MiniCPM_VQA_Simple()
node.tokenizer = object()
node.model = type("MockModel", (), {"chat": lambda self, **kwargs: "ok"})()
real_exists = mod.os.path.exists
mod.os.path.exists = lambda path: True if str(path).endswith("MiniCPM-V-2_6-int4") else real_exists(path)
node.inference(torch.zeros((1, 2, 2, 3), dtype=torch.float32), "describe", 123, False, 0.7, False)
PY
```

Expected result: `AssertionError: Torch not compiled with CUDA enabled` from `torch.cuda.ipc_collect()`.

### 3. `FishSpeech`

- Direct module import is already broken by vendored absolute imports:
  - `nodes/fish_speech/models/text2semantic/llama.py:18-19` imports `fish_speech.conversation` and `fish_speech.utils`
  - isolated import failure: `ModuleNotFoundError: No module named 'fish_speech'`
  - artifact: `docs/artifacts/mixlab/logs/fishspeech-import-probe.log`
- After aliasing the vendored `fish_speech/` directory into `sys.modules`, import advances but still fails on missing dependency:
  - `nodes/fish_speech/utils/instantiators.py:3` imports `hydra`
  - isolated import failure: `ModuleNotFoundError: No module named 'hydra'`
  - artifact: `docs/artifacts/mixlab/logs/fishspeech-import-alias-probe.log`
- Runtime interface is still CUDA/CPU only:
  - `nodes/FishSpeech.py:36-39`, `:79`, `:157-161`, `:231` expose only `["cuda", "cpu"]`
  - `nodes/fish_speech/llama_utils.py:27-30` uses `torch.compile`
  - `nodes/fish_speech/llama_utils.py:58-67` uses `torch.cuda.synchronize()` and `torch.cuda.manual_seed()`
  - `nodes/fish_speech/vqgan_utils.py:10-18,32` loads checkpoints with `map_location=device` and then `model.to(device)`

Minimal reproduction:

```bash
cd /home/intel/tianfeng/comfy/ComfyUI
.venv-xpu/bin/python - <<'PY'
import importlib.util, sys, types
from pathlib import Path
pkg_dir = Path("custom_nodes/comfyui-mixlab-nodes.disabled")
pkg = types.ModuleType("mixlab_probe"); pkg.__path__ = [str(pkg_dir)]; sys.modules["mixlab_probe"] = pkg
nodes_pkg = types.ModuleType("mixlab_probe.nodes"); nodes_pkg.__path__ = [str(pkg_dir / "nodes")]; sys.modules["mixlab_probe.nodes"] = nodes_pkg
spec = importlib.util.spec_from_file_location("mixlab_probe.nodes.FishSpeech", pkg_dir / "nodes" / "FishSpeech.py")
mod = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = mod
spec.loader.exec_module(mod)
PY
```

Expected result: `ModuleNotFoundError: No module named 'fish_speech'`. If the vendored namespace is manually aliased first, the next failure is `ModuleNotFoundError: No module named 'hydra'`.

## Conclusion

These three families remain valid blocked/high-effort exclusions for Mixlab XPU work:

1. `Rembg` still mixes import-time package installation with CUDA-specific execution.
2. `MiniCPM` still has no XPU routing and demonstrably crashes in its non-CUDA unload path.
3. `FishSpeech` is blocked before runtime by vendored import/dependency issues and still exposes CUDA-biased runtime assumptions after that.
