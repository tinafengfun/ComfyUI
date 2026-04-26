好的，核心反思：有些场景一眼就知道 ComfyUI 搞不定，硬试只是浪费时间。需要在 Phase 2 之前加一个**快速分流**。

---

## 添加新模型研发流程 Checklist（v5）

---

### Phase 1：模型摸底

```
□ 基本息
  □ 模型名称：_______________
  □ 任务类型：□ 图像  □ 视频  □ 音频  □ 3D  □ 超分/修复
  □ 参数量：_______________
  □ 模型格式：□ safetensors  □ GGUF  □ Diffusers  □ 其他

□ 组件大小（ HuggingFace 页面直接读文件大小）
  □ DiT / UNet → ___GB（精度：___）
  □ Text Encoder → ___GB（精度：___）
  □ VAE → ___GB
  □ 其他（ControlNet/LoRA/Upscaler）→ ___GB
  □ 是否有 fp8 / GGUF 量化版本 → □ 有  □ 无

□ 估算 24GB BMG 单卡是否放得下
  峰值 ≈ 最大组件 + 30-50% 激活值（视频模型另加帧缓存）
  XPU 额外预留 2-3GB（VRAM 感知不精确）
  估算结果 → ___GB  □ ≤ 24GB  □ > 24GB

□ 使用场景
  □ 交互式创作（WebUI 拖拽节点）
  □ API 服务部署（给其他应用调用）
  □ 批量生产（大量图片/视频自动生成）
  □ 需要运行时切换 LoRA
```

---

### Phase 2：快速分流

**在动手写任何代码之前，先判断走哪条路。**

```
□ 检查以下"直接 SGLang"条件，任一命中 → 跳过 ComfyUI，直奔 Phase 4

  ── 显存硬伤 ─────────────────────────────────────────

  □ A. 模型最小精度（fp8/GGUF Q4）峰值仍 > 24GB
       且 Raylight 不支持该模型架构
       （Raylight 目前仅支持 Wan2.2 / HunyuanVideo 的 Ray 节点）
       → ComfyUI 单卡/多卡都跑不了

  □ B. 模型是 Diffusers 格式 + 参数量 > 10B
       + SGLang 上游已支持
       + 需要多 GPU TP/SP
       → SGLang 的 TP/Ulysses 比 Raylight 更通用更成熟

  ── 使用场景硬伤 ──────────────────────────────────────

  □ C. 主要用途是 API 服务（不需要 WebUI）
       → ComfyUI 的 WebUI 是多余的，SGLang 原生就是 API server

  □ D. 需要运行时 LoRA 热加载/卸载（不重启服务
       → ComfyUI 换 LoRA 要重新执行 workflow
       → SGLang 有 /v1/loras API 动态切换

  □ E. 需要高并发批量推理（多请求排队）
       → ComfyUI 是单用户串行执行
       → SGLang 有请求队列和并发调度

  ── 快速确认 ──────────────────────────────────────────

  以上全部未命中？
  □ → 走 ComfyUI 优先路径（Phase 3）

  命中了？记录原因：_______________
  □ → 跳到 Phase 4（SGLang 路径）
       但仍建议后续补一个 ComfyUI workflow 用于调试/演示


□ 检查以下"明显 ComfyUI"条件，全部命中 → 确认 ComfyUI，不用纠结

  □ F. fp8 峰值 ≤ 16GB（24GB 绰绰有余）
  □ G. 用途是交互式创作 / 复杂多模型串联 workflow
  □ H. ComfyUI 已有原生支持或成熟社区节点
  □ I. 不需要多 GPU

  全部命中 → ✅ 确认 ComfyUI，跳到 Phase 3
```

**分流决策图：**

```
                        新模型
                          │
            ┌─────────────┼─────────────┐
            ▼             ▼             ▼
      明显 ComfyUI    中间地带       明显 SGLang
      (F+G+H+I)     (都没命中)     (A/B/C/D/E 任一)
            │             │             │
            ▼             ▼             ▼
       Phase 3        Phase 3        Phase 4
        直接做        先试 ComfyUI     直接做 SGLang
                    搞不定再升级
```

### Dasiwa 迁移复盘补充

```
□ 成功案例要分层记录
  □ prompt validation 成功
  □ reduced-resource smoke 成功
  □ full-size 成功
  □ 不要把 smoke success 写成 full-size success

□ 失败案例也要沉淀
  □ 失败节点：_______________
  □ 失败模型路径：_______________
  □ 失败时 free / required memory：_______________
  □ 是否已有理论显存账支持该结论：□ 是  □ 否

□ 如果以下两项同时命中，直接升级为“容量阻塞”
  □ 运行时日志显示 free + required > 目标显存
  □ 理论上 active weights + activation peak > 目标显存
  命中 → □ 记录为多卡/模型级优化问题，不再无限重试 generic lowvram

□ 资产策略单独记录
  □ 公开可解析模型：_______________
  □ 仅 smoke 用 compatibility alias：_______________
  □ 仍 unresolved 的专有权重：_______________
  □ 是否已在文档里显式说明 alias 不是 fidelity 证明：□ 是  □ 否
```

---

### Phase 3：ComfyUI 路径

```
□ Step 1：确认集成方式
  □ ComfyUI 已原生支持 → 直接写 workflow，跳到 Step 5
  □ 有社区 Custom Node → 进入 Step 2 写 XPU patch
  □ 都没有 → 自己写 Custom Node 或 standalone script

□ Step 2：本地验证
  docker exec -it dev bash
  cd /llm/ComfyUI/custom_nodes && git clone <社区节点>
  pip install -r requirements.txt
  cd /llm/ComfyUI && python3 main.py --listen 0.0.0.0
  □ 记录所有报错

□ Step 3：写 XPU Patch

  ── 必做（每个模型都要过一遍）─────────────────────

  □ 3a. 设备字符串替换
    grep -rn '"cuda"\|torch\.cuda\.' --include="*.py" .
    □ "cuda" → "xpu"，torch.cuda.* → torch.xpu.*
    □ param.is_cuda → param.is_xpu
    □ torch.autocast(device_type="cuda") → ("xpu")

  □ 3b. SDPA 兼容性
    grep -rn "enable_gqa\|scaled_dot_product_attention\|sdp_kernel" --include="*.py" .
    □ 去掉 enable_gqa=True，手动 repeat_interleave
    □ is_causal + attn_mask 共存 → 拆分
    □ 移除 torch.backends.cuda.sdp_kernel 上下文

  □ 3c. requirements.txt
    □ 移除 torch/torchaudio 版本钉扎

  ── 按需（grep 有结果才处理）──────────────────────

  □ 3d. CUDA Kernel → CPU Fallback
    grep -rn "CUDAExtension\|\.cu\b\|cuda_kernel\|use_cuda" --include="*.py" --include="*.cpp" .
    □ CUDAExtension → CppExtension，移除 .cu
    □ 移除 __host__ __device__，移除 CUDA header
    □ 调用处 input.cpu() → CPU 执行 → result.to(device)
    □ use_cuda_kernel = False
    □ 预估影响：□ 可忽略  □ 中等  □ 大

  □ 3e. Tensor 维度（运行时报错再处理）
    □ 标量索引 → 切片索引
    □ 加 .contiguous()

  □ 3f. I/O fallback
    grep -rn "torchaudio\.save\|torchvision\.io" --include="*.py" .
    □ .cpu() + try/except soundfile fallback

  □ 3g. dtype 转换
    □ fp8 转型报错 → .to("cpu").to(dtype).to("xpu")
    □ mem_get_info → psutil 或 torch.xpu.*

  □ 3h. 分布式通信（多 GPU 才需要）
    grep -rn '"nccl"\|ReduceOp\|batch_isend_irecv' --include="*.py" .
    □ nccl → xccl
    □ ReduceOp.AVG → SUM + divide
    □ batch_isend_irecv → 逐个
    □ init_device_mesh("cuda") → ("xpu")

□ Step 4：生成 patch
  git diff > omni/patches/comfyui_<name>_for_xpu.patch

□ Step 5：跑通验证 + 显存实测
  □ 模型加载成功，生成输出正常
  □ torch.xpu.max_memory_allocated() → ___GB

  根据实测结果：
  ┌─ 没有 OOM → ✅ 留在 ComfyUI，跳到 Phase 5
  │
  ├─ OOM 但接近（差 2-5GB）→ 依次尝试：
  │   □ 1. 换 fp8/GGUF 量化
  │   □ 2. --disable-smart-memory
  │   □ 3. --reserve-vram 2~4
  │   □ 4. --lowvram
  │   □ 任一解决 → ✅ 留在 ComfyUI，跳到 Phase 5
  │
  ├─ OOM + 有多卡 → 尝试 Raylight
  │   □ Raylight 支持该模型架构？
  │   □ 跑通 → ✅ 留在 ComfyUI，跳到 Phase 5
  │
  └─ 以上全部失败 → 进入 Phase 4（SGLang 升级）
      记录失败原因：_______________
```

---

### Phase 4：SGLang 路径

**到这一步有两种情况：Phase 2 快速分流直接到这，或 Phase 3 ComfyUI 失败升级到这。**

```
□ 记录为什么走 SGLang（必填，用于后续文档）
  □ 显存：ComfyUI lowvram 太慢 / 单卡放不下 / Raylight 不支持
  □ 多 GPU：需要 TP/SP，Raylight 不覆盖
  □ 部署：需要 API 服务 / 高并发 / LoRA 热加载
  □ 从 Phase 2 快速分流直接来的，原因：_______________

□ SGLang 前置检查
  □ SGLang 上游是否已支持该模型？
    检查 sglang/multimodal_gen/runtime/models/
    □ 是 → 只需写 XPU patch
    □ 否 → 需要注册 pipeline（重新评估 ROI）

□ SGLang XPU Patch（Phase 3 的 3a-3c 已做或同步做，额外需要）

  □ 新增 XPU Communicator（参考 xpu_communicator.py）
    □ all_reduce / send / recv / all_to_all_4D
    □ all_to_all 用 ft_c 版本避免 XCCL 损坏

  □ 新增 XPU Attention 后端（参考 intel_xpu.py）
    □ head_size 兼容确认
    □ sgl_kernel flash attn 可用 → 用之，否则 SDPA fallback

  □ Platform 注册
    □ current_platform.is_xpu() 分支
    □ forward_xpu 方法
    □ torch.xpu.set_device 初始化

  □ 算子适配
    □ sgl_kernel rmsnorm / fused_add_rmsnorm
    □ Triton kernel 断言 is_cuda → is_xpu

□ SGLang 验证
  □ sglang serve --model-path <path> --port 30010 \
      [--vae-cpu-offload] [--text-encoder-cpu-offload] [--pin-cpu-memory]
  □ curl API 返回正确
  □ 多 GPU: --num-gpus N --tp-size N（如需要）

□ ComfyUI_SGLDiffusion 节点集成（建议补上，用于调试/演示）
  □ SGLDiffusionGenerateImage / GenerateVideo 能覆盖？
  □ 新参数需要扩展节点输入？
  □ workflow 命名：<类别>_<模型名>_sgld.json
```

---

### Phase 5：Dockerfile 集成

```
□ COPY patch
  COPY ./patches/comfyui_<name>_for_xpu.patch /tmp/

□ 选择启用模式
  □ 常驻（active）→ "custom nodes (active)" 部分
  □ 可选（disabled）→ 目录名 .disabled 后缀

□ 安装步骤
  RUN --mount=type=cache,target=/root/.cache/pip \
      cd /llm/ComfyUI/custom_nodes && \
      git clone --depth 1 <repo> [name.disabled] && \
      cd <dir> && \
      git fetch --depth 1 origin <commit SHA> && \
      git checkout <commit SHA> && \
      git apply /tmp/<patch> && \
      pip install -r requirements.txt && \
      rm -f /tmp/<patch>

□ 特殊构建
  □ C++ Extension → cd <subdir> && python setup.py install
  □ 确认已改为 CppExtension
  □ 新文件（xpu_convert.py 等）→ patch 中 diff --git /dev/null
  □ 额外系统依赖 → apt-get install
```

---

### Phase 6：Workflow + 文档

```
□ Workflow JSON
  □ ComfyUI WebUI 调试通过后导出
  □ 命名：<类别>_<模型名>.json
  □ 多 GPU 后缀 _multi_xpu.json
  □ SGLang 后缀 _sgld.json
  □ 放入 omni/workflows/

□ 文档
  □ omni/README.md
    □ Supported Models 表格
    □ workflow 说明
    □ disabled 节点 → Enabling Optional Nodes
    □ 显存建议 / OOM 方案
  □ omni/docs/ComfyUI_Guide.md
    □ 模型目录结构 + 下载链接
    □ 精度/显存建议
    □ CPU fallback 说明（影响显著时标注）
  □ omni/docs/SGLang_*.md（仅 SGLang 路径）
    □ Supported Models
    □ 启动命令 + offload 参数
    □ ComfyUI 联动步骤
```

---

### Phase 7：最终验证

```
□ 构建
  cd omni && bash build.sh

□ 功能
  □ ComfyUI workflow → 生成正常
  □ SGLang API（如适用）→ curl 正确
  □ ComfyUI + SGLang 联动（如适用）→ 节点连通

□ 显存
  □ 默认峰值 → ___GB，24GB 内？
  □ --lowvram 降级方案可用？

□ CPU fallback
  □ F.interpolate patch 生效（启动日志确认）
  □ CUDA kernel 禁用后功能正常
  □ CPU fallback 耗时占比 → ___%
  □ > 20% → 标记待优化

□ 边界
  □ 多 GPU 结果正确（如适用）
  □ disabled 节点 Manager 开关正常（如适用）
  □ fp8 量化精度可接受（如适用）
```

---

### 附录：速查卡

```
┌───────────────────────────────────────────────────────┐
│                  决策流程总览                           │
│                                                       │
│  新模型 ─→ Phase 2 快速分流                             │
│             │                                         │
│    ┌────────┼──────────┐                              │
│    ▼        ▼          ▼                              │
│  明显     中间地带    明显 SGLang                       │
│  ComfyUI  先试 ComfyUI  ┌─ 峰值 > 24GB + 无 Raylight  │
│    │      搞不定再升级   ├─ Diffusers >10B + SGLang已支持│
│    │         │          ├─ 主要用途是 API 服务          │
│    │         │          ├─ 需要 LoRA 热加载             │
│    │         │          └─ 需要高并发批量推理            │
│    ▼         ▼                    ▼                    │
│  Phase 3   Phase 3 → 4        Phase 4                 │
│  ComfyUI   ComfyUI 兜底       直接 SGLang              │
│                                                       │
│  SGLang 是升级路径，不是默认选择                         │
│  但有些场景一眼就知道 ComfyUI 搞不定，别浪费时间试        │
└───────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────┐
│              XPU Patch 8 种模式                        │
├───────────────────────────────────────────────────────┤
│ 必做  1. cuda → xpu 设备字符串                         │
│       2. SDPA: enable_gqa 去掉 + 手动广播              │
│       3. requirements.txt 去 torch 钉扎                │
├───────────────────────────────────────────────────────┤
│ 按需  4. CUDAExtension → CppExtension + CPU fallback  │
│       5. Tensor 索引改切片 + .contiguous()             │
│       6. I/O 操作 .cpu() + fallback                    │
│       7. fp8 dtype 绕道 CPU 转换                       │
│       8. nccl → xccl + ReduceOp workaround            │
└───────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────┐
│           CPU Fallback 影响程度                         │
├───────────────────────────────────────────────────────┤
│ ⚠️ 大   有 CUDA rasterizer/renderer（如 Hunyuan3D）   │
│ 🔶 中   有 custom CUDA 推理 kernel（如 IndexTTS）      │
│ ✅ 小   仅 F.interpolate 全局 patch（其余所有模型）     │
└───────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────┐
│           24GB BMG 单卡兼容性                          │
├───────────────────────────────────────────────────────┤
│ ✅ 直接可用   SD3.5, VoxCPM, IndexTTS, FlashVSR       │
│ ✅ fp8 可用   Z-Image-Turbo, FireRed-GGUF             │
│ ⚠️ 需优化    Flux.1, Qwen-Image, Wan2.2 5B,          │
│              Hunyuan3D, SeedVR2                       │
│ ❌ 需多卡    Wan2.2 14B, HunyuanVideo, LTX-2 19B     │
└───────────────────────────────────────────────────────┘
```
