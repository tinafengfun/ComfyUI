根据代码分析，以下是完整的显存管理机制和基于 24GB BMG 的后端选择指南。

---

## 一、三种后端的显存管理机制

### 1. ComfyUI 显存管理

ComfyUI 有一套**自动模型换入换出**机制（smart memory）核心逻辑在 `comfy/model_management.py` 中：

```
推理流程中的显存生命周期：

[模型A加载到VRAM] → [采样推理] → [模型A卸载到RAM]
                                      ↓
                              [模型B加载到VRAM] → [VAE解码] → [模型B卸载到RAM]
```

**控制参数**（启动 ComfyUI 时指定）：

| 参数 | 效果 | 适用场景 |
|------|------|---------|
| （默认） | Smart Memory：自动根据剩余显存决定哪些模型保留在 VRAM | 显存充裕 |
| `--disable-smart-memory` | 禁用 smart memory，用完立即卸载 | 模型总大小接近显存上限 |
| `--lowvram` | 分块加载模型，每次只加载一部分 layer | 显存严重不足 |
| `--novram` | 所有计算在 CPU 上执 | 几乎无可用显存 |
| `--reserve-vram N` | 预留 N GB 显存给系统/其他用途 | OOM 崩溃时 |

**XPU 上的特殊问题**：

```python name=comfyui_seedvr2_xpu.patch url=https://github.com/intel/llm-scaler/blob/ea6a0d61bfb9df0a4f447ab9f63d1f01016aa7ac/omni/patches/comfyui_seedvr2_xpu.patch#L264-L328
# XPU 不支持 torch.cuda.mem_get_info()
# SeedVR2 patch 中用 psutil 系统内存做代理
elif is_xpu_available():
    mem = psutil.virtual_memory()
    free_memory = mem.total - mem.used
    total_memory = mem.total
```

旧 patch 里确实有这种 `psutil` 代理方式；但**当前 ComfyUI 主线代码**已经优先走 `torch.xpu.memory_stats()` / `reserved_bytes` / `active_bytes` 统计，而不是完全依赖系统 RAM 代理。  
即便如此，**XPU 上的可用显存判断仍然没有 CUDA 那么稳定**，所以对接近上限的工作负载，仍然要预留更保守的 buffer。

### 2. SGLang 显存管理

SGLang 采用 **显式 offload** 策略，不做自动换入换出：

```
启动时一次性加载模型到 VRAM，推理期间常驻

[DiT 常驻 VRAM] ←→ [采样循环]
[VAE offload 到 CPU] → [需要时加载到 VRAM 做单次解码] → [卸载回 CPU]
[Text Encoder offload 到 CPU] → [编码一次后卸载]
```

| 参数 | 效果 |
|------|------|
| `--vae-cpu-offload` | VAE 在 CPU 上执行，节省 ~1-2GB VRAM |
| `--text-encoder-cpu-offload` | 文本编码器在 CPU 执行，节省 ~4-8GB VRAM |
| `--pin-cpu-memory` | 钉住 CPU 内存，加速 CPU↔GPU 数据传输 |

### 3. Standalone / diffsynth 显存管理

standalone 示例（如 Qwen-Image）使用 diffsynth 框架，有**分块 VRAM 管理**：

```python name=qwen_image_example.py url=https://github.com/intel/llm-scaler/blob/ea6a0d61bfb9df0a4f447ab9f63d1f01016aa7ac/omni/standalone_examples/Qwen-image/qwen_image_example.py#L31-L32
pipe.enable_vram_management(vram_buffer=1)  # 预留 1GB buffer
# 内部通过 torch.xpu.get_device_properties().total_memory 获取总显存
# vram_limit = total_memory - vram_buffer
# 超出 limit 的模型块自动 offload 到 CPU
```

---

## 二、所有模型的显存需求估算

基于 `ComfyUI_Guide.md` 中的模型文件大小和精度，估算推理峰值 VRAM：

> **估算规则**：fp16 参数量 × 2B + fp8 参数量 × 1B + 运行时激活值（通常为模型大小的 30-50%），VAE 解码额外 ~1-3GB

### 图像生成模型

| 模型 | DiT 大小 | CLIP 大小 | VAE | 推理峰值估算 | 24GB 单卡 |
|------|---------|----------|-----|------------|----------|
| **SD 3.5 Medium** | ~4.3GB (fp16) | 内含 | 内含 | ~8GB | ✅ 充裕 |
| **Z-Image-Turbo** | ~6GB (bf16) | ~4GB (Qwen3 4B) | ~0.2GB | ~13GB | ✅ 可用 |
| **Flux.1 Kontext Dev** | ~10GB (fp8) | ~5GB (T5-XXL fp8) + ~0.2GB (CLIP-L) | ~0.2GB | ~18GB | ⚠️ 紧张 |
| **Qwen-Image (fp8)** | ~7GB (fp8) | ~7GB (Qwen 2.5 VL 7B fp8) | ~0.1GB | ~18GB | ⚠️ 紧张 |
| **Qwen-Image-Edit** | ~7GB (fp8) | ~7GB | ~0.1GB | ~18GB | ⚠️ 紧张 |
| **FireRed-Image-Edit (GGUF Q4_K)** | ~3GB (Q4_K) | ~7GB (Qwen fp8) | ~0.1GB | ~14GB | ✅ 可用 |

### 视频生成模型

| 模型 | DiT 大小 | CLIP 大小 | VAE | 推理峰值估算 | 24GB 单卡 |
|------|---------|----------|-----|------------|----------|
| **Wan2.2 5B TI2V** | ~10GB (fp16) | ~5GB (UMT5 fp8) | ~0.3GB | ~20GB | ⚠️ 紧张 |
| **Wan2.2 14B T2V** | ~14GB (fp8×2) | ~5GB (UMT5 fp8) | ~0.3GB | **~24GB** | ❌ 不够 |
| **Wan2.2 14B I2V** | ~14GB (fp8) | ~5GB | ~0.3GB | **~24GB** | ❌ 不够 |
| **HunyuanVideo 1.5 8.3B** | ~16GB (fp16) | ~7GB + ~0.2GB | ~0.3GB | **~28GB** | ❌ 不够 |
| **LTX-2 19B** | ~19GB (fp8) | ~6GB (Gemma 12B fp4) | ~0.2GB | **~30GB** | ❌ 不够 |

### 其他模型

| 模型 | 推理峰值估算 | 24GB 单卡 |
|------|------------|----------|
| **Hunyuan3D 2.1** | ~12-16GB | ⚠️ 紧张 |
| **VoxCPM 1.5 (800M)** | ~3GB | ✅ 充裕 |
| **IndexTTS 2** | ~4GB | ✅ 充裕 |
| **SeedVR2 3B (fp8)** | ~8GB + 视频帧缓存 | ⚠️ 视频长度敏感 |
| **FlashVSR** | ~6GB + 视频帧缓存 | ⚠️ 视频长度敏感 |

---

## 三、24GB BMG 的后端选择决策树

```
模型推理峰值 VRAM 估算
│
├─ ≤ 16GB → ✅ ComfyUI 单卡（默认模式）
│   示例：SD3.5, Z-Image-Turbo, VoxCPM, IndexTTS, FireRed-GGUF
│   无需特殊配置
│
├─ 16-22GB → ⚠️ ComfyUI 单卡 + 显存优化
│   示例：Flux.1, Qwen-Image, Wan2.2 5B
│   需要：
│   □ 使用 fp8 / GGUF 量化模型
│   □ 启动参数加 --disable-smart-memory
│   □ 如仍 OOM → --reserve-vram 4
│   □ CLIP/TextEncoder 如果有 offload 选项则启用
│
├─ 22-24GB → ⚠️ 极限操作，两种选择
│   示例：Wan2.2 14B (fp8)
│   │
│   ├─ 选择1：ComfyUI + lowvram
│   │   □ --lowvram 分块加载
│   │   □ 速度慢但能跑
│   │
│   └─ 选择2：SGLang + offload
│       □ --vae-cpu-offload --text-encoder-cpu-offload --pin-cpu-memory
│       □ 只有 DiT 常驻 VRAM（~14GB），其余全在 CPU
│       □ 适合需要 API 服务的场景
│
├─ > 24GB → ❌ 单卡放不下，必须多 GPU 或更强 offload
│   示例：HunyuanVideo 8.3B fp16, LTX-2 19B, Wan2.2 14B fp16
│   │
│   ├─ 方案1：ComfyUI + Raylight 多 XPU
│   │   □ 2×24GB = 48GB，模型分布在多卡上
│   │   □ 使用 Ray Init Actor 节点设 GPU=2, ulysses_degree=2
│   │   □ 适用：Wan2.2 14B, HunyuanVideo 1.5
│   │
│   ├─ 方案2：SGLang 多 GPU
│   │   □ --num-gpus 2 --tp-size 2 或 --ulysses-degree 2
│   │   □ 适用：FLUX.1-dev, Wan2.1/2.2
│   │
│   └─ 方案3：更激进的量化
│       □ GGUF Q4_0/Q4_K 可将模型压缩到 1/4
│       □ 配合 ComfyUI-GGUF-XPU 节点使用
│       □ 质量有损但能单卡运行
```

---

## 四、更新后的 Checklist（增加显存决策）

在原 Checklist 的 **Phase 0** 之后，插入新的 **Phase 0.5**：

```
Phase 0.5：显存评估与后端选择
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

□ 收集模型组件大小
  □ DiT / UNet 权重文件大小 → ___GB
  □ Text Encoder (CLIP/T5/Qwen) 文件大小 → ___GB
  □ VAE 文件大小 → ___GB
  □ 其他组件（ControlNet/LoRA/Upscaler）→ ___GB

□ 确认权重精度
  □ fp32 (×4B/参数) / fp16 (×2B) / fp8 (×1B) / GGUF Q4 (×0.5B)
  □ 是否有 fp8 / GGUF 量化版本可用？→ 优先使用

□ 估算推理峰值 VRAM
  公式：峰值 ≈ max(DiT + 激活值, DiT + VAE解码缓存)
  □ 若 ComfyUI smart memory → 峰值 = 最大单组件 + 30-50% 激活值
  □ 若 SGLang 常驻 → 峰值 = DiT常驻 + 推理激活值
  □ 视频模型额外考虑：帧数 × 分辨率 × 通道数 的 latent 缓存
  □ 如果已有真实 shape，可补算单 block 的 q/k/v + FFN hidden 峰值
  估算结果 → ___GB

□ 基于 24GB 做后端决策
  ┌─────────────────────────────────────────────────────────┐
  │ 峰值 ≤ 16GB                                            │
  │   → ComfyUI 默认模式                                    │
  │   → 无需特殊配置                                        │
  │   → 无需 SGLang                                        │
  ├─────────────────────────────────────────────────────────┤
  │ 峰值 16-22GB                                           │
  │   → ComfyUI + 显存优化                                  │
  │     □ 使用 fp8/GGUF 量化模型                            │
  │     □ --disable-smart-memory                           │
  │     □ --reserve-vram 2~4                               │
  │   → SGLang 可选（如需 API）                              │
  │     □ --text-encoder-cpu-offload                       │
  ├─────────────────────────────────────────────────────────┤
  │ 峰值 22-24GB                                           │
  │   → ComfyUI --lowvram 或 SGLang 全 offload             │
  │     □ --vae-cpu-offload --text-encoder-cpu-offload     │
  │   → 必须使用 fp8 或更低精度                              │
  │   → 降低分辨率/帧数作为备选方案                           │
  ├─────────────────────────────────────────────────────────┤
  │ 峰值 > 24GB                                            │
  │   → 必须多 GPU                                         │
  │     □ ComfyUI + Raylight (ulysses_degree=N)            │
  │     □ SGLang --num-gpus N --tp-size N                  │
  │   → 或更激进量化（GGUF Q4_0）                            │
  │   → 记录所需最少 GPU 数量 → ___块                        │
  └─────────────────────────────────────────────────────────┘

□ 确定启动参数模板
  ComfyUI: python3 main.py --listen 0.0.0.0 _______________
  SGLang:  sglang serve --model-path ___ --port 30010 ______

□ XPU 显存查询限制确认
  □ XPU 不支持 torch.cuda.mem_get_info()
  □ ComfyUI smart memory 在 XPU 上精度较低（用 psutil 代理）
  □ 比 CUDA 估算多预留 2-3GB buffer 以防 OOM
  □ 推荐实际测试 torch.xpu.memory_allocated() 验证

□ 容量阻塞判定
  □ runtime: free + required > total_vram
  □ theory: active weights + activation peak > target_vram
  □ 两项同时成立 → 记录为结构性超预算，升级多卡/activation 优化
```

### 显存决策的快速参考卡

```
┌──────────────────────────────────────────────────────┐
│         BMG 24GB 单卡模型兼容性速查                     │
├──────────────────────────────────────────────────────┤
│ ✅ 直接可用（ComfyUI 默认）                            │
│    SD 3.5 Medium, VoxCPM, IndexTTS, FlashVSR          │
│                                                      │
│ ✅ fp8 可用（ComfyUI 默认 + fp8 权重）                  │
│    Z-Image-Turbo, FireRed-GGUF                        │
│                                                      │
│ ⚠️ 需要优化（--disable-smart-memory / offload）        │
│    Flux.1, Qwen-Image, Qwen-Image-Edit                │
│    Wan2.2 5B, Hunyuan3D, SeedVR2                      │
│                                                      │
│ ❌ 需要多卡或激进量化                                   │
│    Wan2.2 14B, HunyuanVideo 8.3B, LTX-2 19B          │
│    → 2 卡 Raylight / SGLang TP                        │
└──────────────────────────────────────────────────────┘
```

---

## 五、Dasiwa / Wan21 I2V full-size OOM 个案归档

### 场景

- workflow: `cartoon/DaSiWa-WAN2.2图生视频流-支持单图_双图_三图出视频json.json`
- branch: `54`
- full-size: `1024 x 1024`, `81 frames`
- 设备: 单张 Intel B60 / 24 GB
- 运行时模型: `WAN21` I2V

### 已验证结论

1. **不是缺节点、缺模型、坏 LoRA。**
2. **不是 `WAN21_SCAIL`。**
3. **不是 cond/uncond batching。**  
   仪表日志已证明 `candidate_batch=1`。
4. **真正的 OOM 点在 `KSamplerAdvanced` `41` 的第一次 full-size denoise。**

### 理论显存账

| 项目 | 估算 |
| --- | ---: |
| low-noise UNet 权重 | **37.44 GiB** fp16 / **18.72 GiB** fp8-ish |
| 主激活 `x=[B,L,C]` | **0.86 GiB** |
| `q+k+v` | **2.58 GiB** |
| FFN hidden | **2.32 GiB** |
| 单个 block 激活包络 | **5.79 - 7.51 GiB** |

其中：

- `L = 21 * 64 * 64 + 64 * 64 = 90,112`
- `C = 5120`
- `FFN = 13824`

所以即使理想化按 fp8-style 权重常驻估算：

- **18.72 GiB**（UNet 权重）
- 加 **5.79 - 7.51 GiB**（block 激活）
- 约等于 **24.5 - 26.2 GiB**

已经超过 24 GB 单卡预算。

### 运行时实测也支持这一点

`COMFY_MEMORY_DEBUG=1` 日志显示：

- `apply_model` 前 free memory 约 **13.48 GiB**
- Comfy 估算还需要 **15.48 GiB**
- 隐含峰值约 **24.71 GiB**

### 哪些东西适合 offload 到 CPU

| 组件 | 是否适合 | 说明 |
| --- | --- | --- |
| Text Encoder | ✅ | 一次编码型，优先 CPU |
| Qwen3_VQA / prompt 生成 | ✅ | 预处理阶段，适合 CPU 或临时加载 |
| VAE encode / decode | ✅ | 可减轻静态 VRAM 压力，但会明显变慢 |
| CLIP-Vision / 轻量前处理 | ✅ | 节省少量显存 |
| RIFE / 后处理模型 | ✅ | 应延后加载，不应与主 UNet 同驻 |
| active WAN21 UNet | ❌ | 主计算体，offload 后无法保持可接受吞吐 |
| WAN21 attention / FFN 激活 | ❌ | 这是本次 OOM 的主因，不能靠 generic CPU offload 解决 |

### 个案结论

对这条 full-size `54` 路径：

- **可以**把低算力、一次性、后处理型组件更积极地 offload 到 CPU
- 这对显存管理是好事，也值得作为默认策略
- 但它**不能改变根因**：`41` 的 plain `WAN21` full-size denoise activation peak 本身已经高于 24 GB

因此如果坚持：

1. 原 workflow 语义不变
2. `1024 / 81` 不降
3. 单卡 B60 24 GB

那么结论就是：**需要多卡或 activation-level 的模型级优化**，而不是只靠通用 offload。
