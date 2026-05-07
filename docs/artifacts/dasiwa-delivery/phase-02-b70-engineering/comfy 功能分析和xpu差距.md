# Comfy 功能分析和 XPU 差距

## 1. 这次已经验证通过的能力

### ComfyUI core / workflow tooling

- workflow asset inventory
- workflow asset staging
- workflow -> API prompt 转换
- branch-level prompt submit / history 回收

### custom nodes

| 节点族 | 现状 |
| --- | --- |
| `Prompt_Edit` | 在无前端 client / API 模式下可回退，不再死等 |
| `LaoLi_Lineup` | 已改成走 `comfy.model_management`，不再硬绑 `torch.cuda.*` |
| `RAMCleanup` / `VRAMCleanup` | 可执行，但本质是清理辅助，不是 full-size 解法 |
| `Qwen3_VQA` | 非 CUDA 设备下可回退非 FP8 / 非 bitsandbytes 路径 |
| `WanMultiFrameRefToVideo` | smoke 级可运行，不是“节点无法加载”问题 |
| `RIFE VFI` | smoke 级可运行 |

## 2. 这次补齐的“不是节点本体，而是迁移链”的缺口

### 2.1 workflow asset inventory 对 `cnr_id` 别名不敏感

现象：

- workflow 里写的是 `comfyui_prompt_edit`
- 脚本 manifest 里是 `Comfyui_Prompt_Edit`

结果：

- inventory 误报 unknown
- setup / clone 流程不完整

修复：在 `workflow_asset_inventory.py` 中统一 alias。

### 2.2 workflow -> prompt 对 widget-only 节点导出不完整

这是本次最关键的通用缺口。

受影响节点：

- `Int`
- `Prompt_Edit`
- `LaoLi_Lineup`
- `LoraLoaderModelOnly`

如果不补：

- prompt 能“生成”
- 但 API submit 会 400
- 或者在运行前校验时报 required input missing

### 2.3 stale server 不会自动感知新 custom nodes

本次一开始 API 报：

- `Node 'Int' not found`

根因不是 repo 里没有 `ComfyLiterals`，而是 **8188 上跑着的是旧 server**。  
结论：custom node 补齐后必须重启当前 ComfyUI 实例，不能假设热加载。

## 3. XPU 与当前 CUDA 生态的真实差距

## 3.1 成功层

这些层面 XPU 已经足够支撑迁移：

- 节点加载
- 常规 LoRA / CLIP / VAE / Qwen 回退
- smoke 级分支执行
- `WanMultiFrameRefToVideo` 这类 workflow-specific custom node 的基础运行

## 3.2 不足层

### A. Wan full-size denoise activation headroom 不足

两个 full-size geometry probe 都失败在 Wan 主体内部：

- `54`: `model.apply_model`
- `208`: Wan block FFN / `gelu`

这说明 XPU 当前瓶颈不在“能不能加载模型”，而在：

- full-size activation
- scratch buffer
- runtime 临时分配
- 错误后的恢复稳定性

### B. 失败后的恢复不够稳

full-size probe 失败后还会看到：

- `UR_RESULT_ERROR_DEVICE_LOST`

说明 OOR 后 cleanup / synchronize 路径也可能受损，自动恢复能力弱于理想状态。

### C. 粗粒度显存观测不够解释瞬时峰值

`xpu-smi` 每 2 秒采样只能看到外部近似：

- 能看出整体接近上限
- 但抓不住 kernel 级瞬时 spikes

因此单靠外部显存曲线，容易低估 FFN/GELU 前后的真实峰值。

## 4. 对节点策略的结论

| 节点/组件 | 建议 |
| --- | --- |
| `UNETLoader` | 保持 CPU-biased |
| `CLIPLoader` | 保持 CPU |
| `VAELoader` | 可保留 XPU 候选，但不是 full-size 根因 |
| `LaoLi_Lineup` | 可保留，但只当辅助，不当主解法 |
| `RAMCleanup` / `VRAMCleanup` | 保留；只负责 hygiene |
| `Prompt_Edit` | 保留，API 模式可安全回退 |
| `Qwen3_VQA` | 保留 CPU-biased |
| `WanMultiFrameRefToVideo` | 保留；真实限制在后续 Wan denoise |

## 5. 收敛结论

这次 B70 workflow 在 B60/24 GiB 上的状态，不再是“迁移没做完”，而是分成两层：

1. **迁移层已经打通**
   - 资产、节点、prompt、smoke execution 都已打通
2. **容量层仍然受限**
   - full-size geometry 在 Wan denoise activation 上触发 XPU 资源上限

也就是说，这已经不是“再补几个 XPU 兼容 patch 就会自然成功”的阶段，而是：

- 要么接受 smoke / reduced-geometry 运行
- 要么进入多卡 / activation-level optimization 阶段
