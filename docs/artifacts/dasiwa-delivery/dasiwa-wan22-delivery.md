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

## 4. B70 上当前已经准备好的环境

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

## 5. 最终用户 GUI 手工验证步骤

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

## 6. 本次已经完成的验证证据

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

## 7. 最终用户验收标准

当下面这些都满足时，可以认为这次 patch/workflow 交付在 GUI 层面是通过的：

1. GUI 能打开 workflow，且没有红色缺失节点
2. `sage_attention` / `enable_fp16_accumulation` 的关键节点值与交付文档一致
3. 点 `Queue Prompt` 后整图能跑通 smoke 版
4. 最终输出节点 `54` / `131` / `208` 都产出结果
5. 结果文件在 `generated/manual-gui/` 下可见并可回放/预览

## 8. 本地已同步回来的交付资料

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

## 9. 给最终用户的最短操作版本

如果只给最终用户一句最短操作说明，可以用这个：

1. 打开 `http://172.16.120.116:8190`
2. 加载 `DaSiWa-WAN2.2图生视频流-支持单图_双图_三图出视频json-B70-GUI终验-smoke版.json`
3. 确认没有缺失节点
4. 直接点 `Queue Prompt`
5. 检查 `54` / `131` / `208` 三路最终输出是否都生成视频

这就是当前推荐的最终用户 GUI 验证路径。
