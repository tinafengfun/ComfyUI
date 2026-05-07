# DaSiWa WAN2.2 图生视频流最终用户验证方案

- **Workflow**: `DaSiWa-WAN2.2图生视频流-支持单图_双图_三图出视频json.json`
- **Validation target**: 最终用户在 B70 机器上通过 **ComfyUI GUI** 手工验证 patch/workflow 可用
- **Remote host**: `intel@172.16.120.116` (`hostname=4-b60`)
- **Dedicated GUI server**: `http://172.16.120.116:8190`
- **Remote ComfyUI**: `/home/intel/tianfeng-b70/ComfyUI`
- **Remote venv**: `/home/intel/tianfeng-b70/ComfyUI/.venv-xpu`
- **Current validation result**:
  1. 三路保留输出分支 GUI-parity smoke 已成功
  2. **整图提交**的 GUI smoke 已成功，最终输出节点 `54` / `131` / `208` 都有产物

---

## 1. 这次交付的目标已经改成什么

这份交付不再只是“工程侧 smoke 记录”，而是面向**最终用户验证**的方案。

它覆盖四层：

1. **workflow.json 改动/验证副本**
2. **B70 上的 ComfyUI 部署与启动**
3. **GUI 手工验证步骤**
4. **接近端到端的整图 smoke 验证**

也就是说，最终用户不需要只看 API prompt 或脚本日志，而是可以：

1. 打开浏览器访问 ComfyUI
2. 加载交付的 workflow JSON
3. 在 GUI 里检查关键开关
4. 直接点 `Queue Prompt`
5. 观察三路最终视频输出是否都成功

## 2. 交付中的三个 workflow 文件

### 2.1 保留原始图的副本

- `docs/artifacts/dasiwa-delivery/workflow/DaSiWa-WAN2.2图生视频流-支持单图_双图_三图出视频json.json`

用途：

- 保留原始 workflow 图结构
- 用于审计原图，不带手工验证友好的固化改动

### 2.2 GUI 验证版

- `docs/artifacts/dasiwa-delivery/workflow/DaSiWa-WAN2.2图生视频流-支持单图_双图_三图出视频json-B70-GUI验证版.json`

用途：

- 把 Intel XPU 必需的安全开关直接写回 workflow JSON
- 适合在 GUI 里检查 patch/关键节点状态

### 2.3 GUI 终验 smoke 版

- `docs/artifacts/dasiwa-delivery/workflow/DaSiWa-WAN2.2图生视频流-支持单图_双图_三图出视频json-B70-GUI终验-smoke版.json`

用途：

- 在 GUI 验证版基础上，进一步把尺寸/帧数降到 smoke 规模
- 适合最终用户直接在 GUI 中点一次 `Queue Prompt` 做接近端到端的验证

**建议：**

1. 审核 patch/节点状态时看 **GUI 验证版**
2. 真正手工点 GUI 做终验时用 **GUI 终验 smoke 版**

## 3. workflow.json 改动汇总

### 3.1 原始 workflow 的启用状态

原始 workflow 没有额外 bypass/disable：

- 总节点数：`231`
- 总连线数：`248`
- 所有节点 `mode=0`
- 最终视频输出节点：`54`、`131`、`208`

### 3.2 GUI 验证版中固化的 Intel XPU 安全改动

| 节点 | 原值 | 验证版值 | 原因 |
| --- | --- | --- | --- |
| `1`,`2`,`80`,`81`,`161`,`172` `PathchSageAttentionKJ.sage_attention` | `auto` | `disabled` | Intel XPU 不走 SageAttention 路径 |
| `6`,`7`,`85`,`86`,`179`,`182` `ModelPatchTorchSettings.enable_fp16_accumulation` | `True` | `False` | 使用 Intel XPU 安全值，避免原 NVIDIA 导向累加策略 |
| `57`,`133`,`171` `CLIPLoader.device` | 已是 `cpu` | 保持 `cpu` | 为 Wan 主采样保留 XPU 显存 |

### 3.3 GUI 终验 smoke 版额外固化的轻量化改动

| 节点 | 原值 | 终验 smoke 值 | 用途 |
| --- | --- | --- | --- |
| `51` `Int.Number` | `1024` | `512` | 降低分支 `54` 的几何规模 |
| `75` `Int.Number` | `81` | `17` | 降低分支 `54` 帧数 |
| `128` `Int.Number` | `1024` | `512` | 降低分支 `131` 的几何规模 |
| `153` `Int.Number` | `81` | `17` | 降低分支 `131` 帧数 |
| `213` `Int.Number` | `97` | `17` | 降低分支 `208` 帧数 |

**结论：**

1. 原始 workflow 结构没有被删改或 bypass
2. GUI 验证版只固化**安全开关**
3. GUI 终验 smoke 版在安全开关之外，再固化**轻量 smoke 参数**

## 4. fresh ComfyUI 部署清单（从空目录开始）

这一节用于 **fresh 部署**。也就是说，不依赖当前已经跑起来的 `8190` 实例，而是从一个新的 ComfyUI checkout 重新部署到可交付、可 GUI 终验的状态。

### 4.1 最小部署目标

fresh 部署完成后，至少要同时满足下面 4 件事：

1. ComfyUI 能正常启动，并识别 `xpu:0`
2. workflow 导入后没有红色缺失节点
3. Intel XPU 相关 patch 和安全开关都已到位
4. GUI 里直接点 `Queue Prompt` 可以完成 smoke 级终验

### 4.2 fresh 部署必须具备的仓库/环境

| 类别 | fresh 部署要求 | 备注 |
| --- | --- | --- |
| 主仓库 | 一个新的 ComfyUI checkout | 需要应用本交付包里的主仓库 patch |
| Python 环境 | 独立 venv，验证环境为 Python `3.13` + `torch 2.11.0+xpu` | 建议直接使用 Intel XPU 可用的 venv |
| 模型路径 | `extra_model_paths.yaml` 或等价配置可解析共享模型根 | 当前验证根为 `/home/intel/lucas/weights/models` |
| 输入资源 | workflow 所需输入图已经放到 ComfyUI `input/` | 当前交付里已列出可用样例图 |
| custom_nodes | 必须把本 workflow 用到的 custom node 仓库都安装齐 | 少一个 repo，GUI 导入就会出现缺失节点 |

### 4.3 这条 workflow 在 fresh 部署里必须安装的 custom_nodes

下表是当前 workflow 里已经确认会被解析到的 custom node 仓库。

| 仓库目录 | 上游仓库 | 在 workflow 中的代表节点 |
| --- | --- | --- |
| `ComfyLiterals` | `https://github.com/M1kep/ComfyLiterals.git` | `Int` |
| `ComfyUI-LaoLi-lineup` | `https://github.com/Laolilzp/ComfyUI-LaoLi-lineup.git` | `LaoLi_Lineup` |
| `ComfyUI-PainterNodes` | `https://github.com/princepainter/ComfyUI-PainterNodes.git` | `PainterI2V` |
| `ComfyUI-Wan22FMLF` | `https://github.com/wallen0322/ComfyUI-Wan22FMLF.git` | `WanMultiFrameRefToVideo` |
| `ComfyUI_Qwen3-VL-Instruct` | `https://github.com/IuvenisSapiens/ComfyUI_Qwen3-VL-Instruct.git` | `Qwen3_VQA` |
| `Comfyui-Memory_Cleanup` | `https://github.com/LAOGOU-666/Comfyui-Memory_Cleanup.git` | `RAMCleanup`, `VRAMCleanup` |
| `Comfyui_Prompt_Edit` | `https://github.com/xuchenxu168/Comfyui_Prompt_Edit.git` | `Prompt_Edit` |
| `ComfyUI-Custom-Scripts` | `https://github.com/pythongosssss/ComfyUI-Custom-Scripts.git` | `ShowText|pysssss` |
| `ComfyUI-Easy-Use` | `https://github.com/yolain/ComfyUI-Easy-Use.git` | `easy cleanGpuUsed` |
| `ComfyUI-Frame-Interpolation` | `https://github.com/Fannovel16/ComfyUI-Frame-Interpolation.git` | `RIFE VFI` |
| `ComfyUI-KJNodes` | `https://github.com/kijai/ComfyUI-KJNodes.git` | `ImageResizeKJv2`, `ModelPatchTorchSettings`, `PathchSageAttentionKJ` |
| `ComfyUI-VideoHelperSuite` | `https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git` | `VHS_VideoCombine` |
| `ComfyUI_LayerStyle` | `https://github.com/chflame163/ComfyUI_LayerStyle.git` | `LayerUtility: ImageScaleByAspectRatio V2` |
| `rgthree-comfy` | `https://github.com/rgthree/rgthree-comfy.git` | `Fast Groups Bypasser (rgthree)` |

### 4.4 fresh 部署时哪些 patch / 定制是必须带上的

#### 必须应用的代码 patch

| 类型 | 文件 | 作用 |
| --- | --- | --- |
| ComfyUI 主仓库 patch | `patches/dasiwa-b70/ComfyUI-main.patch` | workflow 转 prompt、资产解析、branch 运行辅助修复 |
| ComfyUI 主仓库 patch | `patches/dasiwa-b70/ComfyUI-original-branch54-fix.patch` | 修正原始 workflow 分支 `54` 的 LoRA selector 导出/校验问题 |
| custom node patch | `patches/dasiwa-b70/ComfyUI-LaoLi-lineup.patch` | 去掉 CUDA 专属显存/同步依赖 |
| custom node patch | `patches/dasiwa-b70/ComfyUI_Qwen3-VL-Instruct.patch` | 去掉 CUDA capability/FP8/bitsandbytes/flash-attn 绑定 |
| custom node patch | `patches/dasiwa-b70/Comfyui_Prompt_Edit.patch` | 修正无前端会话时的 prompt-edit 行为 |
| custom node patch | `patches/dasiwa-b70/ComfyUI-Easy-Use.patch` | 去掉 `torch.cuda.synchronize()` 依赖 |

#### 必须带上的运行时 Intel-safe 定制

这些不是 repo patch 必改，但 **fresh 部署时必须落实到 workflow 或运行策略里**：

| 节点/族 | fresh 部署要求 | 原因 |
| --- | --- | --- |
| `PathchSageAttentionKJ` | `sage_attention = disabled` | 原 NVIDIA 导向路径不作为 Intel XPU 安全默认 |
| `ModelPatchTorchSettings` | `enable_fp16_accumulation = false` | 原 GPU-first 累加策略不作为 Intel XPU 安全默认 |
| `CLIPLoader` | 保持 CPU-biased | 给 Wan 主采样留出 XPU 显存 |
| `ImageResizeKJv2`, `LayerUtility: ImageScaleByAspectRatio V2` | 保持 CPU 路径 | 当前未作为可信 Intel XPU 优化路径交付 |

#### 当前验证中不要求额外 Intel XPU 代码改造的 custom nodes

这些仓库在本次交付里 **需要安装**，但不要求再追加额外 XPU 专项 patch：

- `ComfyLiterals`
- `ComfyUI-PainterNodes`
- `ComfyUI-Wan22FMLF`
- `Comfyui-Memory_Cleanup`
- `ComfyUI-Custom-Scripts`
- `ComfyUI-Frame-Interpolation`
- `ComfyUI-VideoHelperSuite`
- `ComfyUI_LayerStyle`
- `rgthree-comfy`

### 4.5 fresh 部署的模型与资源检查清单

fresh 部署前，至少确认这些模型类别可以被 ComfyUI 解析到：

1. Wan UNet / diffusion models
2. workflow 依赖的 LoRAs
3. `umt5_xxl_fp16.safetensors`
4. `wan_2.1_vae.safetensors`

本次验证已确认存在的关键模型包括：

- `wan2.2_i2v_A14b_high_noise_scaled_fp8_e4m3_lightx2v_4step_comfyui.safetensors`
- `wan22I2VLLSDasiwaNm.low.safetensors`
- `dasiwaWAN22I2V14B_radiantcrushLow.safetensors`
- `Wan2.2-Fun-A14B-InP-high-noise-MPS.safetensors`
- `Wan2.2-Fun-A14B-InP-low-noise-HPS2.1.safetensors`
- `lightx2v_I2V_14B_480p_cfg_step_distill_rank256_bf16.safetensors`
- `umt5_xxl_fp16.safetensors`
- `wan_2.1_vae.safetensors`

### 4.6 fresh 部署推荐启动方式

下面这个启动方式是当前 GUI 终验路径对应的推荐基线：

```bash
python main.py \
  --listen 0.0.0.0 \
  --port 8190 \
  --database-url sqlite+aiosqlite:////path/to/ComfyUI/user/comfyui-gui-validation.db \
  --disable-ipex-optimize \
  --lowvram \
  --reserve-vram 1.5 \
  --input-directory /path/to/ComfyUI/input \
  --output-directory /path/to/ComfyUI/docs/artifacts/dasiwa-delivery/generated/manual-gui
```

如果是 fresh 部署，推荐先单独起一个 **专用验证实例**，不要直接复用已有生产实例，这样可以避免：

1. 端口冲突
2. `comfyui.db` 锁冲突
3. 老实例里 custom nodes / object_info 表面状态不一致

### 4.7 fresh 部署完成后的首轮自检

在把 workflow 交给最终用户前，先做这组检查：

1. `system_stats` 能看到 `xpu:0`
2. `object_info` 里至少能看到这些关键节点：
   - `Int`
   - `Prompt_Edit`
   - `Qwen3_VQA`
   - `WanMultiFrameRefToVideo`
   - `PathchSageAttentionKJ`
   - `ModelPatchTorchSettings`
   - `VHS_VideoCombine`
3. 导入 `...B70-GUI终验-smoke版.json` 后没有红色缺失节点
4. 抽查安全开关值无误
5. 直接整图 `Queue Prompt` 能产出 `54` / `131` / `208`

## 5. B70 上当前已经准备好的环境

### 4.1 当前可用实例

本次专门为最终用户 GUI 验证启动的实例：

- **URL**: `http://172.16.120.116:8190`
- **监听方式**: `0.0.0.0:8190`
- **输出目录**: `/home/intel/tianfeng-b70/ComfyUI/docs/artifacts/dasiwa-delivery/generated/manual-gui`
- **日志**: `docs/artifacts/dasiwa-delivery/logs/server-gui-8190.log`

如果你所在网络不能直接访问：

```bash
ssh -L 8190:127.0.0.1:8190 intel@172.16.120.116
```

然后打开：

- `http://127.0.0.1:8190`

### 4.2 当前实例已经确认的环境状态

通过 `system_stats` / `object_info` 已确认：

- `Device: xpu:0 Intel(R) Graphics [0xe223]`
- `vram_total: 32530182144`（约 31 GB）
- 关键节点都已加载：
  - `Int`
  - `Prompt_Edit`
  - `Qwen3_VQA`
  - `WanMultiFrameRefToVideo`
  - `PathchSageAttentionKJ`
  - `ModelPatchTorchSettings`
  - `VHS_VideoCombine`

### 4.3 模型与输入资源

当前实例使用：

- `extra_model_paths.yaml` 指向共享模型根：`/home/intel/lucas/weights/models`
- 输入图已经就绪：
  - `input/74183b15ad77b23879693ee598e7c829.jpg`
  - `input/fd58009a5996be7eca0ebd9d07aaeae993215afc92585c235d6474b520f612ef.png`
  - `input/7ca01a9571891af904332232d83d3dca68bc9dee109be5606f7476f53859624d.jpg`
  - `input/eb635abe438eca7a01f0cdff92c3f87cb765c98ac1800596d595ea5cc19b3008.jpg`
  - `input/aaa5571069522d7606a152e5597c0d9b65881928bb939fd328339b297b8a805f.jpg`

## 6. 最终用户 GUI 手工验证步骤

以下是推荐的人工验证顺序。

### 5.1 打开 GUI

1. 浏览器访问 `http://172.16.120.116:8190`
2. 如果打不开，走 SSH tunnel：
   - `ssh -L 8190:127.0.0.1:8190 intel@172.16.120.116`
   - 浏览器打开 `http://127.0.0.1:8190`

### 5.2 导入终验 smoke workflow

在 GUI 中加载：

- `docs/artifacts/dasiwa-delivery/workflow/DaSiWa-WAN2.2图生视频流-支持单图_双图_三图出视频json-B70-GUI终验-smoke版.json`

### 5.3 第一步：导入后立刻检查

导入后先确认：

1. **没有红色缺失节点**
2. 左下/右下没有明显的 `missing node` / `unknown node` 报错
3. 三个最终视频输出节点仍然存在：
   - `54`
   - `131`
   - `208`

如果这里失败，就不要继续点 `Queue Prompt`。

### 5.4 第二步：抽查关键节点值

建议在 GUI 里点开这些节点，确认值和交付一致。

#### 安全开关节点

1. `PathchSageAttentionKJ`
   - `1`, `2`, `80`, `81`, `161`, `172`
   - 应该看到：`sage_attention = disabled`
2. `ModelPatchTorchSettings`
   - `6`, `7`, `85`, `86`, `179`, `182`
   - 应该看到：`enable_fp16_accumulation = false`

#### smoke 规模节点

1. `51` -> `512`
2. `75` -> `17`
3. `128` -> `512`
4. `153` -> `17`
5. `213` -> `17`

### 5.5 第三步：直接整图提交

在 GUI 中直接点击：

- **`Queue Prompt`**

这一步是本次交付最关键的最终用户验证动作。

它不是只跑一个 branch 子图，而是提交整张 smoke 版 workflow，接近真实最终用户使用路径。

### 5.6 第四步：观察运行过程

运行时建议观察：

1. 队列没有立刻报错
2. 没有出现缺模型、缺节点、类型不匹配这类前置错误
3. 运行过程中不会因为 SageAttention / fp16 accumulation 路径报错
4. 最终历史记录里可以看到三个最终输出节点完成：
   - `54`
   - `131`
   - `208`

### 5.7 第五步：检查结果文件

输出目录：

- `/home/intel/tianfeng-b70/ComfyUI/docs/artifacts/dasiwa-delivery/generated/manual-gui`

本次已验证到的整图 GUI smoke 产物包括：

- `AnimateDiff_00001.mp4`
- `AnimateDiff_00001.png`
- `Video/%date:yyyy-MM-dd%/%date:hhmmss%_00001.mp4`
- `Video/%date:yyyy-MM-dd%/%date:hhmmss%_00001.png`
- `Video/%date:yyyy-MM-dd%/%date:hhmmss%_00002.mp4`
- `Video/%date:yyyy-MM-dd%/%date:hhmmss%_00002.png`

注意：

- `54` / `131` 这两路使用的文件名前缀来自 workflow 本身，当前环境下保留了 `%date:...%` 文本样式
- **验收重点不是固定文件名，而是三个最终输出节点都成功产出视频/预览**

## 7. 本次已经完成的验证证据

### 6.1 GUI-parity branch smoke（逐路）

使用：

- `...json-B70-GUI验证版.json`

结果：

- `54` 成功
- `131` 成功
- `208` 成功

证据：

- `logs/branch-54-gui-validation.log`
- `logs/branch-131-gui-validation.log`
- `logs/branch-208-gui-validation.log`
- `prompts/branch-54-gui-validation.json`
- `prompts/branch-131-gui-validation.json`
- `prompts/branch-208-gui-validation.json`
- `generated/manual-gui/gui-validated-o54_00001.mp4`
- `generated/manual-gui/gui-validated-o131_00001.mp4`
- `generated/manual-gui/gui-validated-o208_00001.mp4`

### 6.2 整图 GUI smoke（接近端到端）

使用：

- `...json-B70-GUI终验-smoke版.json`

验证方式：

- 先用 `workflow_to_prompt.py --no-force-cpu` 从 workflow 生成 prompt
- 再把整张 prompt 提交到 `8190` 实例

结果：

- 同一次提交里，最终输出节点 `54` / `131` / `208` 都有产物

证据：

- `logs/full-gui-smoke-history.json`
- `prompts/full-gui-smoke-prompt.json`
- `generated/manual-gui/AnimateDiff_00001.mp4`
- `generated/manual-gui/Video/%date:yyyy-MM-dd%/%date:hhmmss%_00001.mp4`
- `generated/manual-gui/Video/%date:yyyy-MM-dd%/%date:hhmmss%_00002.mp4`

## 8. 最终用户验收标准

当下面这些都满足时，可以认为这次 patch/workflow 交付在 GUI 层面是通过的：

1. GUI 能打开 workflow，且没有红色缺失节点
2. `sage_attention` / `enable_fp16_accumulation` 的关键节点值与交付文档一致
3. 点 `Queue Prompt` 后整图能跑通 smoke 版
4. 最终输出节点 `54` / `131` / `208` 都产出结果
5. 结果文件在 `generated/manual-gui/` 下可见并可回放/预览

## 9. 本地已同步回来的交付资料

本地交付包现在包含：

- 本文档：
  - `docs/artifacts/dasiwa-delivery/dasiwa-wan22-delivery.md`
- 三个 workflow 文件：
  - 原始保留副本
  - GUI 验证版
  - GUI 终验 smoke 版
- branch 级 GUI 验证日志 / prompt / 媒体
- 整图 GUI smoke 的 prompt / history / 媒体
- B70 实例日志：
  - `logs/server-gui-8190.log`

## 10. 给最终用户的最短操作版本

如果只给最终用户一句最短操作说明，可以用这个：

1. 打开 `http://172.16.120.116:8190`
2. 加载 `DaSiWa-WAN2.2图生视频流-支持单图_双图_三图出视频json-B70-GUI终验-smoke版.json`
3. 确认没有缺失节点
4. 直接点 `Queue Prompt`
5. 检查 `54` / `131` / `208` 三路最终输出是否都生成视频

这就是当前推荐的最终用户 GUI 验证路径。
