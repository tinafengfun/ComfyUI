# DaSiWa WAN2.2 图生视频流交付记录

- **Workflow**: `DaSiWa-WAN2.2图生视频流-支持单图_双图_三图出视频json.json`
- **Remote validation node**: `intel@172.16.120.116` (`hostname=4-b60`, B70 远端验证环境)
- **ComfyUI**: `/home/intel/tianfeng-b70/ComfyUI`
- **Venv**: `/home/intel/tianfeng-b70/ComfyUI/.venv-xpu`
- **Result**: 远端 B70 节点三路保留输出分支 smoke 复测全部成功，生成 3 个 `mp4` 和 3 个 `png`

---

## 1. Workflow enable 汇总

这条 workflow 的**源 JSON 没有额外 bypass/disable 节点**：

- 总节点数：`231`
- 总连线数：`248`
- 节点 `mode=0`：`231`
- 最终视频输出节点：`54`、`131`、`208`

本次交付测试没有改 workflow 图结构，也没有删节点；实际修改发生在**测试 prompt 的安全覆盖**上。

| 项目 | 源 workflow 值 | 本次测试实际生效值 | 原因 |
| --- | --- | --- | --- |
| 全图节点启用状态 | 全部 `mode=0` | 保持不变 | 保留原 workflow，不做 bypass/删节点 |
| `PathchSageAttentionKJ`（分支 54：node `1`,`2`） | `sage_attention=auto` | `sage_attention=disabled` | Intel XPU 不走 SageAttention 路径 |
| `ModelPatchTorchSettings`（分支 54：node `6`,`7`） | `enable_fp16_accumulation=True` | `False` | Intel XPU 交付测试使用安全覆盖，避免原 NVIDIA 导向累加策略 |
| `PathchSageAttentionKJ`（分支 131：node `80`,`81`） | `sage_attention=auto` | `sage_attention=disabled` | 同上 |
| `ModelPatchTorchSettings`（分支 131：node `85`,`86`） | `enable_fp16_accumulation=True` | `False` | 同上 |
| `PathchSageAttentionKJ`（分支 208：node `161`,`172`） | `sage_attention=auto` | `sage_attention=disabled` | 同上 |
| `ModelPatchTorchSettings`（分支 208：node `179`,`182`） | `enable_fp16_accumulation=True` | `False` | 同上 |
| 分支 smoke 设备策略 | workflow 原始图未单独固化 | `cpu-biased` prompt policy | 保留 XPU 给 Wan 主采样路径，降低显存风险 |

**结论**：

1. 客户拿到的源 workflow 可以保持原图不动。
2. 交付测试时需要明确：**真正需要汇总的是“源 workflow 的 enable 状态” + “测试 prompt 的安全覆盖值”**。
3. 这次 workflow 的关键 enable 覆盖只有两类：
   - `sage_attention: auto -> disabled`
   - `enable_fp16_accumulation: True -> False`

## 2. 这次交付采用的手工测试步骤

以下步骤已经在远端 B70 节点复跑通过，可直接作为客户侧手工测试基线。

### 2.1 启动 ComfyUI

```bash
cd /home/intel/tianfeng-b70/ComfyUI
. .venv-xpu/bin/activate
python main.py \
  --listen 127.0.0.1 \
  --port 8188 \
  --disable-ipex-optimize \
  --lowvram \
  --reserve-vram 1.5 \
  --input-directory /home/intel/tianfeng-b70/ComfyUI/input \
  --output-directory /home/intel/tianfeng-b70/ComfyUI/output
```

### 2.2 准备本次交付使用的 workflow 副本

```bash
cd /home/intel/tianfeng-b70/ComfyUI
mkdir -p docs/artifacts/dasiwa-delivery/workflow
cp <source-workflow> \
  docs/artifacts/dasiwa-delivery/workflow/DaSiWa-WAN2.2图生视频流-支持单图_双图_三图出视频json.json
```

本次实际复测使用的是：

- `docs/artifacts/dasiwa-delivery/workflow/DaSiWa-WAN2.2图生视频流-支持单图_双图_三图出视频json.json`

### 2.3 资产预检

```bash
cd /home/intel/tianfeng-b70/ComfyUI
. .venv-xpu/bin/activate
python script_examples/workflow_asset_inventory.py \
  docs/artifacts/dasiwa-delivery/workflow/DaSiWa-WAN2.2图生视频流-支持单图_双图_三图出视频json.json \
  --search-root /home/intel/lucas/weights/models \
  --search-root /home/intel/hf_models \
  --search-root /tmp/hf_models \
  --search-root /home/intel/tianfeng-b70/ComfyUI/models
```

### 2.4 三路 branch smoke

```bash
cd /home/intel/tianfeng-b70/ComfyUI
. .venv-xpu/bin/activate
WORKFLOW_JSON=/home/intel/tianfeng-b70/ComfyUI/docs/artifacts/dasiwa-delivery/workflow/DaSiWa-WAN2.2图生视频流-支持单图_双图_三图出视频json.json \
OUTPUT_ROOT=/home/intel/tianfeng-b70/ComfyUI/docs/artifacts/dasiwa-delivery \
SERVER=127.0.0.1:8188 \
STEPS=8 \
bash script_examples/dasiwa_b70_branch_smoke.sh
```

脚本会分别测试：

1. 输出节点 `54`
2. 输出节点 `131`
3. 输出节点 `208`

## 3. 本次远端复测结果

| 分支 | 状态 | Prompt | Log | 生成结果 |
| --- | --- | --- | --- | --- |
| `54` | success | `docs/artifacts/dasiwa-delivery/prompts/branch-54-smoke.json` | `docs/artifacts/dasiwa-delivery/logs/branch-54-smoke.log` | `generated/dasiwa-delivery-o54_00001.mp4`, `generated/dasiwa-delivery-o54_00001.png` |
| `131` | success | `docs/artifacts/dasiwa-delivery/prompts/branch-131-smoke.json` | `docs/artifacts/dasiwa-delivery/logs/branch-131-smoke.log` | `generated/dasiwa-delivery-o131_00001.mp4`, `generated/dasiwa-delivery-o131_00001.png` |
| `208` | success | `docs/artifacts/dasiwa-delivery/prompts/branch-208-smoke.json` | `docs/artifacts/dasiwa-delivery/logs/branch-208-smoke.log` | `generated/dasiwa-delivery-o208_00001.mp4`, `generated/dasiwa-delivery-o208_00001.png` |

复测时远端服务日志确认：

- `Total VRAM 31023 MB`
- `Device: xpu:0 Intel(R) Graphics [0xe223]`
- `extra_model_paths.yaml` 指向共享模型根：`/home/intel/lucas/weights/models`

## 4. 本次交付落盘内容

本地已同步回来的交付资料：

- `docs/artifacts/dasiwa-delivery/dasiwa-wan22-delivery.md`
- `docs/artifacts/dasiwa-delivery/workflow/DaSiWa-WAN2.2图生视频流-支持单图_双图_三图出视频json.json`
- `docs/artifacts/dasiwa-delivery/logs/asset-inventory.txt`
- `docs/artifacts/dasiwa-delivery/logs/branch-54-smoke.log`
- `docs/artifacts/dasiwa-delivery/logs/branch-131-smoke.log`
- `docs/artifacts/dasiwa-delivery/logs/branch-208-smoke.log`
- `docs/artifacts/dasiwa-delivery/logs/server-8188.log`
- `docs/artifacts/dasiwa-delivery/prompts/branch-54-smoke.json`
- `docs/artifacts/dasiwa-delivery/prompts/branch-131-smoke.json`
- `docs/artifacts/dasiwa-delivery/prompts/branch-208-smoke.json`
- `docs/artifacts/dasiwa-delivery/generated/dasiwa-delivery-o54_00001.mp4`
- `docs/artifacts/dasiwa-delivery/generated/dasiwa-delivery-o54_00001.png`
- `docs/artifacts/dasiwa-delivery/generated/dasiwa-delivery-o131_00001.mp4`
- `docs/artifacts/dasiwa-delivery/generated/dasiwa-delivery-o131_00001.png`
- `docs/artifacts/dasiwa-delivery/generated/dasiwa-delivery-o208_00001.mp4`
- `docs/artifacts/dasiwa-delivery/generated/dasiwa-delivery-o208_00001.png`

## 5. 给客户的交付结论

这次交付可以按下面的话术对外：

1. **源 workflow 图结构保持不变，未做 bypass 或删节点。**
2. **交付测试在远端 B70 节点复跑通过，三路保留视频输出全部成功。**
3. **需要显式说明的 enable 覆盖只有 SageAttention 和 FP16 accumulation，两者都在测试 prompt 中切到了 Intel XPU 安全值。**
4. **客户如果按本文的手工测试步骤操作，应能得到与本次交付一致的 smoke 结果。**
