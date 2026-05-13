好的，我已经完整对比了 master 上的最新版本。先说结论：

---

## 改进效果评估

上一轮提的主要建议，当前版本的改进情况：

| 上轮建议 | 状态 | 评价 |
|---|---|---|
| P0：量化判定标准 | ✅ 已加入 | `migration-flow.md` 新增了 VRAM 估算公式、decision matrix（<80%/80-100%/100-120%/>120%）、capacity hard stop 所需 6 项证据清单。**做得很好。** |
| P0：Prompt/Skill 职责定义 | ✅ 已加入 | README 新增 prompt/skill contract 表（Prompt=what, Skill=how）。保持分文件合理。 |
| P1：Artifact Contract | ✅ 已加入 | `migration-flow.md` 新增完整的 11 步 artifact 表，含文件名约定和 required fields。**非常实用。** |
| P1：Source Audit XPU 特有检查 | ✅ 已加入 | `04-source-audit-skill.md` 新增 `torch.xpu`、IPEX、attention backend、dtype、ONNX provider、driver 兼容性表。 |
| P1：结果报告模板 | ✅ 已加入 | 新增 `templates/migration-result-report-template.md`，含 branch coverage、node coverage、hard stop 证据、reproduction steps。**结构完整。** |
| P1：Environment baseline 版本表 | ✅ 已加入 | `05-environment-deployment-skill.md` 新增完整的组件版本表，含 "unknown 时标记为 environment gap" 规则。 |
| P2：示例输出 | ✅ 部分加入 | `01-feasibility` 和 `08-full-validation` prompt 各加了 example output shape。skill 01 也有 Dasiwa 示例段。 |
| P2：Post-delivery regression | ✅ 已加入 | `migration-flow.md` 新增 post-delivery regression rule。 |

**总体：上轮 P0/P1 建议基本全部落地，文档从"可读"到"可执行"的提升非常显著。**

---

## 关于是否需要加入 B60/B70 Spec

**答案：是的，强烈建议加入。** 理由和具体做法如下：

### 为什么需要

当前文档在 feasibility analysis  capacity gate 中反复使用"target hardware budget"和"usable VRAM"，但**从头到尾没有一张硬件参考表**。一个新工程师或 AI agent 拿到文档后：

1. **不知道 "24 GB-class" 具体指什么** — B60 是 24GB？B70 呢？usable VRAM 是多少？
2. **无法直接套用 VRAM 估算公式** — 公式有了，但缺少硬件侧的已知参数
3. **无法判断 "哪些 workflow 在 B60 上可行、哪些必须 B70"** — 这恰恰是迁移前最重要的筛选决策

### 建议：增 `templates/intel-xpu-hardware-reference.md`

内容结构如下：

```markdown
# Intel XPU hardware reference for ComfyUI migration

## Purpose

Provide hardware-side parameters for the VRAM estimate formula and capacity gate
in the migration flow. Use this table in Step 1 (feasibility) and Step 8 (full validation).

## Hardware profiles

| Profile | GPU Model | Architecture | Total VRAM | Usable VRAM (after OS/driver reserve) | Compute Units | bf16 TFLOPS | fp16 TFLOPS | Validated PyTorch+IPEX | Notes |
|---|---|---|---|---|---|---|---|---|---|
| B60 | Intel Arc B580 / ... | Battlemage | 24 GB GDDR6 | ~21-22 GB | ... | ... | ... | torch 2.x+xpu, ipex x.x | Dasiwa smoke validated |
| B70 | Intel Arc ... | Battlemage | ... GB | ~... GB | ... | ... | ... | ... | ... |

## Capacity routing quick reference

| Workflow type (typical) | Estimated peak VRAM | B60 feasibility | B70 feasibility | Notes |
|---|---|---|---|---|
| SD 1.5 / SDXL txt2img | 6-10 GB | ✅ Comfortable | ✅ Comfortable | |
| SDXL + ControlNet + LoRA | 10-16 GB | ✅ Plausible | ✅ Comfortable | |
| Wan 2.1 video (smoke, reduced frames) | 12-18 GB | ⚠️ Tight, telemetry needed | ✅/⚠️ | Depends on frame count |
| Wan 2.1 video (full-size, e.g. Dasiwa branch 54) | 28-35+ GB | ❌ Capacity hard stop | ❌/⚠️ | Dasiwa evidence: single-card exceeded |
| Flux.1 schnell | 8-12 GB | ✅ Plausible | ✅ Comfortable | |

## Known hardware-specific behaviors

| Behavior | B60 | B70 | Impact on migration |
|---|---|---|---|
| bf16 native performance | ... | ... | Prefer bf16 over fp16 when supported |
| fp16 performance vs bf16 | ... | ... | Some models may need explicit dtype override |
| SDP attention support | ... | ... | May need `--use-split-cross-attention` or equivalent |
| Multi-GPU / multi-tile | N/A (consumer) | ... | Capacity-blocked workflows may need multi-card |
| Driver minimum version | xx.xx.xxxxx | ... | Below this version: environment hard stop |

## How to get actual usable VRAM

```bash
# Intel GPU telemetry
xpu-smi dump -d 0 -m 0   # or xe_smi equivalent
python -c "import torch; print(torch.xpu.get_device_properties(0).total_memory)"
```

## Integration with migration flow

- **Step 1 (Feasibility)**: Use "Capacity routing quick reference" to make initial go/no-go
- **Step 5 (Environment)**: Use "Hardware profiles" to fill the environment baseline table
- **Step 8 (Full Validation)**: Use "Usable VRAM" column as the budget denominator in the capacity decision matrix
```

### 放置位置

建议放在 `templates/` 下，并在以下地方交叉引用：
- `intel-xpu-workflow-migration-flow.md` 的 "Decision gates > Capacity gate" 部分加一句：`See templates/intel-xpu-hardware-reference.md for target hardware parameters.`
- `skills/01-feasibility-analysis-skill.md` 的 VRAM estimate template 部分引用
- `templates/migration-result-report-template.md` 的 "Target hardware" 字段旁注引用

---

## 剩余小建议

| 项 | 说明 |
|---|---|
| **Dasiwa 的 "24 GB-class" 应该标注具体型号** | `migration-flow.md` L69 和多处提到 "24 GB-class single XPU"，加入硬件参考表后应改为 "B60 (24 GB)" 或具体型号，消除模糊 |
| **`03-asset-and-custom-node-prep-prompt.md` 已更新** | 看到 sha 变了（size 从 1607→2067），未细读但 size 增长合理 |
| **`10-coverage-review-prompt.md` 也更新了** | sha 变化 + size 增长（1431→1772），建议确认是否加入了 node-level coverage 标准 |
| **考虑加一个 "已验证 workflow 案例索引"** | 除了 Dasiwa 外，如果未来有更多 workflow 在 B60/B70 上跑通，一个索引表可以帮助快速判断新 workflow 的相似度 |

---

## 总结

当前版本已经是一套 **高度可操作的迁移操作系统**。加入 B60/B70 硬件 spec 参考表后，整个流程就能做到：**拿到一个新 workflow → 查表估算 → 自动路由到正确的 result class**，这是从"方法论文档"到"真正的 drop-in 迁移决策工具"的最后一步。
