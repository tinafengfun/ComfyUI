Now let me read the prompts and skills files:我已经完整阅读了 `docs/draft` 下的全部文档（4 个顶层文件 + 11 个 prompts + 11 个 skills）。以下是从 **能否生成清晰迁移结果或 hard stop** 以及 **ComfyUI XPU 支持完整可落地性** 角度出发的系统性改进建议。

---

## 一、总体评价

这套文档体系**方法论层面非常扎实**——11 步流程、5 类结果分类（XPU migrated / CPU fallback / environment gap / feature-development gap / capacity hard stop）、cross-step constraints、以及从 Dasiwa 实战中提炼的 lessons 都很好。

但从 **"拿来就能跑出清晰结果"** 的落地角度看，有以下几个系统性短板：

---

## 二、核心改进建议

### 🔴 P0：少可执行的判定标准（Decision Criteria）

**问题**：每一步的 hard stop 都是用自然语言描述的定性判断，缺少可量化的 threshold。AI agent 或新工程师拿到这套文档后，仍然需要大量主观判断。

**具体表现**：
- `08-full-validation-and-capacity` 说 "runtime and theory both exceed budget" → 但多少算 exceed？超出 10% 是否能用 CPU offload 缓解？
- `01-feasibility-analysis` 说 "fidelity appears larger than hardware budget" → 没有给出估算公式或参考表

**建议**：
1. 在 `01-feasibility-analysis-skill.md` 中加入 **VRAM 估算公式模板**：`estimated_peak = model_weights + KV_cache + activation_peak + safety_margin`，并给出常见模型族的参考值（如 Wan 2.1 ~14B params ≈ 需要 X GB fp16）
2. 在 `08-full-validation-and-capacity-skill.md` 中加入 **决策矩阵**：

   | runtime_required / budget | < 80% | 80-100% | 100-120% | > 120% |
   |---|---|---|---|---|
   | 行动 | 继续 | 尝试 offload | 最后一次尝试 + 准备 hard stop | 直接 hard stop |

3. 每个 hard stop 条件加上 **具体的证据格式要求**，比如："hard stop 必须附带 `xe_smi` 输出截图 + traceback + 理论计算过程"

---

### 🔴 P0：Prompt 和 Skill 之间职责重叠且缺乏交叉引用

**问题**：prompt 描述了 steps 和 constraints，skill 也描述了 algorithm 和 hard stops，两者内容高度重复但又各自独立，没有明确的 "prompt 是给用户发给 AI 的，skill 是 AI 内部执参考" 这个契约。

**建议**：
1. 在 README 中明确定义：**Prompt = 用户指令模板（what to do）**，**Skill = 执行方法参考（how to do）**
2. 每个 prompt 的 Constraints 部分应该直接 `{% include %}` 或引用对应 skill 的 hard stops，避免两处维护
3. 考虑合并为 **单文件格式**：每步一个文件，内含 `## Prompt` 和 `## Skill Reference` 两个 section——22 个文件太碎了

---

### 🟡 P1：缺少 Step 之间的状态传递规范

**问题**：11 步之间的输出/输入理论上是链式依赖的（step 2 的 topology inventory 是 step 4 source audit 的输入），但文档没有定义 **artifact 的具体格式和文件命名规范**。

**建议**：在 `intel-xpu-workflow-migration-flow.md` 中加入一个 **Artifact Contract** 表：

| Step | 输出 artifact | 文件名约定 | 必须字段 |
|---|---|---|---|
| 1 | feasibility report | `{workflow}-feasibility.json` | `target`, `budget`, `initial_class`, `next_step` |
| 2 | topology inventory | `{workflow}-inventory.json` | `branches[]`, `output_nodes[]`, `critical_path[]` |
| ... | ... | ... | ... |

这样 AI agent 才能在 step N 自动检查 step N-1 的输出是否完整。

---

### 🟡 P1：Source Audit 缺少 Intel XPU 特有的检查项

**问题**：`04-source-audit-skill.md` 主要关注 `.cuda()` 和 CUDA 扩展，但 Intel XPU 迁移还有很多特有的坑没有覆盖。

**建议**：在 algorithm 中增加以下检查项：
- `torch.xpu` API 兼容性检查（哪些 `torch.cuda` API 在 `intel_extension_for_pytorch` 中有对应）
- `ipex.optimize()` 是否适用的判断
- Flash Attention / SDP attention 在 XPU 上的支持状态
- `bf16` vs `fp16` 在 XPU 上的性能差异（Arc/Flex/Max 不同）
- ONNX Runtime 的 `DmlExecutionProvider` vs `OpenVINOExecutionProvider` 选择
- 已知的 `intel_extension_for_pytorch` 版本与 PyTorch 版本兼容矩阵

---

### 🟡 P1：缺少 "迁移结果报告" 的标准模板

**问题**：文档说要产出各种 report，但没有给出一个 **最终交付给客户/管理层的标准化结果模板**。`documentation-consolidation-plan.md` 自己也指出 "still no single management summary"。

**建议**：新增 `templates/migration-result-report-template.md`，包含：

```
# {Workflow Name} Intel XPU Migration Result

## Executive Summary
- 结果分类: [XPU Migrated / CPU Fallback / Capacity Hard Stop / ...]
- 目标硬件: 
- 验证级别: [Smoke / Full-size / Customer GUI]

## Branch Coverage Matrix
| Branch ID | 描述 | 结果 | 证据链接 |
|---|---|---|---|

## Hard Stops (如有)
| 类型 | 阻塞点 | Runtime 证据 | 理论分析 | 建议 |
|---|---|---|---|---|

## Known Gaps
## Patches Applied
## Reproduction Steps
```

---

### 🟡 P1：Environment Deployment (Step 5) 缺少具体的 Intel 软件栈版本矩阵

**问题**：`05-environment-deployment-prompt.md` 只说 "build reproducible Intel XPU baseline"，但没有给出已验证可用的软件栈组合。

**建议**：增加一个 **已验证环境基线表**：

| 组件 | 已验证版本 | 备注 |
|---|---|---|
| PyTorch | 2.x.x+xpu | |
| intel_extension_for_pytorch | x.x.x | |
| oneAPI Base Toolkit | 202x.x | |
| Level Zero | x.x.x | |
| GPU Driver | xx.xx | |
| ComfyUI | commit SHA | |

---

### 🟢 P2：Retrospective 和 Closure Review 可合并

`migration-retrospective.md` 和 `request-closure-review.md` 内容有 ~40% 重叠（都在讲 Dasiwa 经验和 what's still weak）。建议合并为一个 `migration-retrospective-and-closure.md`，减少审阅负担。

---

### 🟢 P2：Prompt 缺少示例输入/输出

每个 prompt 都只有抽象的 steps 和 constraints，没有一个 **concrete example**。建议至少给 Step 1 (Feasibility) 和 Step 8 (Full Validation) 各加一个 Dasiwa 的真实示例（脱敏后），让新用户知道 "好的输出长什么样"。

---

## 三、从 XPU 支持完整可落地角度的特别建议

| 维度 | 当前状态 | 建议 |
|---|---|---|
| **硬件覆盖** | 文档只笼统说 "Intel XPU"，未区分 Arc/Flex/Max | 增加硬件分级，不同级别 VRAM 对应不同 fidelity 上限 |
| **自动化程度** | 全部是人工/AI对话驱动 | 考虑为 Step 4 (source audit) 和 Step 6 (prompt validation) 提供可执行脚本框架 |
| **回归测试** | 没有提及迁移完成后的持续验证 | 增加 Step 12: Regression CI — 确保上游 ComfyUI 更新不破坏迁移结果 |
| **多 workflow 批量场景** | 全部面向单 workflow | 增加批量迁移的并行策略和优先级排序指导 |

---

## 四、总结

这套文档的 **方法论骨架和经验沉淀是优秀的**，核心价值在于5类结果分类体系和 "不允许作弊式成功" 的 cross-step constraints。主要差距是 **从 "可读" 到 "可执行"** 的最后一公里：量化判定标准、artifact 格式规范、环境基线、结果报告模板、以及 Intel XPU 特有技术细节。补齐这些后，这套文档就能真正成为一个 drop-in 的迁移操作手册。
