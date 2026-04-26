# B70 workflow 分析

## 1. 目标与约束

- workflow: `cartoon/DaSiWa-WAN2.2图生视频流-支持单图 _ 双图 _ 三图 出视频-B70.json`
- 实际目标硬件: **单卡 B60 / 24 GiB**
- 原始 workflow JSON、节点 mode/state、图结构均保持不改
- 仅允许设备放置、CPU offload、补丁和外部输入 alias；不删除、不 bypass 节点

## 2. 图结构快照

| 项 | 值 |
| --- | --- |
| nodes | 231 |
| links | 248 |
| 全部 node mode | `0` |
| 输出节点 | `54`, `131`, `208` |

关键节点族：

- `UNETLoader` x6
- `CLIPLoader` x3
- `VAELoader` x3
- `KSamplerAdvanced` x6
- `RIFE VFI` x3
- `VHS_VideoCombine` x3
- `PainterI2V` x1
- `WanFirstLastFrameToVideo` x1
- `WanMultiFrameRefToVideo` x1
- `Qwen3_VQA` x3
- `LaoLi_Lineup` x6
- `RAMCleanup` x4
- `VRAMCleanup` x4

## 3. 三条分支的功能侧重点

| 输出 | 路径特征 | 关键尺寸入口 | 备注 |
| --- | --- | --- | --- |
| `54` | 单图 -> `PainterI2V` -> Wan denoise -> RIFE | `51=1024`, `75=81` | 额外依赖 `texture_fur.png` |
| `131` | 双图 -> `WanFirstLastFrameToVideo` -> Wan denoise -> RIFE | `128=1024`, `153=81` | 额外依赖 `leather_sofa.png` |
| `208` | 三图/多帧参考 -> `WanMultiFrameRefToVideo` -> Wan denoise -> RIFE | `213=97` | 最重的多参考生成路径 |

## 4. 资产与自定义节点盘点

### 已解析的核心模型

- `wan2.2_i2v_A14b_high_noise_scaled_fp8_e4m3_lightx2v_4step_comfyui.safetensors`
- `wan22I2VLLSDasiwaNm.low.safetensors`
- `Wan2.2-Fun-A14B-InP-high-noise-MPS.safetensors`
- `Wan2.2-Fun-A14B-InP-low-noise-HPS2.1.safetensors`
- `lightx2v_I2V_14B_480p_cfg_step_distill_rank256_bf16.safetensors`
- `umt5_xxl_fp16.safetensors`
- `umt5_xxl_fp8_e4m3fn_scaled.safetensors`
- `wan_2.1_vae.safetensors`

### 已解析的自定义节点仓

- `ComfyUI-LaoLi-lineup`
- `Comfyui-Memory_Cleanup`
- `Comfyui_Prompt_Edit`
- `ComfyUI-Wan22FMLF`
- `ComfyUI_Qwen3-VL-Instruct`
- `ComfyUI-PainterNodes`
- `ComfyUI-KJNodes`
- `ComfyUI-VideoHelperSuite`
- `ComfyLiterals`

### smoke-only compatibility alias

下列资产在本地未恢复出原始来源，只做了 **smoke 兼容映射**，不能当作“原权重/原素材已找回”：

| 类型 | workflow 名称 | 实际 smoke 覆盖 |
| --- | --- | --- |
| 低噪 UNet | `wan22I2VLLSDasiwaNm.low.safetensors` | `smoothMix_Wan2214B-I2V_i2v_V20_Low.safetensors` |
| 输入贴图 | `texture_fur.png` | `74183b15ad77b23879693ee598e7c829.jpg` |
| 输入贴图 | `leather_sofa.png` | `fd58009a5996be7eca0ebd9d07aaeae993215afc92585c235d6474b520f612ef.png` |

## 5. 本次迁移中补齐的工具链缺口

### 5.1 asset inventory / setup

- `workflow_asset_inventory.py` 增加 `cnr_id` alias 归一化：
  - `comfyui_prompt_edit`
  - `comfyui_memory_cleanup`
  - `wan22fmlf`
- 新增：
  - `script_examples/dasiwa_b70_search_models.sh`
  - `script_examples/dasiwa_b70_stage_smoke_assets.sh`
  - `script_examples/dasiwa_b70_prepare_assets.sh`

### 5.2 workflow -> prompt 转换

`workflow_to_prompt.py` 本次补齐了几类“纯 widget / 半 widget”节点的 prompt 导出：

- `Int` / `Float` / `String` / `Checkpoint` / `Lora`
- `Prompt_Edit`
- `LaoLi_Lineup`
- `LoraLoaderModelOnly`

没有这些映射时，API prompt 会缺关键输入，表现为：

- `Int` 节点值丢失
- `Prompt_Edit.edited_text_widget` 丢失
- `LaoLi_Lineup` 的阈值/间隔/strict_mode 丢失
- `LoraLoaderModelOnly` 的 `lora_name` / `strength_model` 丢失

### 5.3 branch runner

- `workflow_branch_runner.py` 保存 prompt 时自动创建父目录

## 6. smoke 验证结果

| 输出 | 配置 | 结果 | 产物 |
| --- | --- | --- | --- |
| `54` | `512 / 17` + `texture_fur` alias | 成功 | `generated/dasiwa-b70-smoke-o54_00001.mp4` |
| `131` | `512 / 17` + `leather_sofa` alias | 成功 | `generated/dasiwa-b70-smoke-o131_00001.mp4` |
| `208` | `17` 帧 | 成功 | `generated/dasiwa-b70-smoke-o208_00001.mp4` |

这说明在 **CPU-biased loader policy + lowvram server** 下：

1. 三条分支都可以走完整执行链
2. `WanMultiFrameRefToVideo` 分支不是“节点无法加载”问题
3. 当前瓶颈已从“节点缺失/脚本缺口”收敛到“full-size 几何规模下的 XPU 资源极限”
