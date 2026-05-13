完整阅读了最新版所有变更。以下是 review 结果。

---

## 本轮变更总结

| 新增/变更 | 评价 |
|---|---|
| ✅ 新增 `migration-workflow/README.md` 作为执行入口 | **很大提升。** 终于有了那个"一页纸操作手册"——11 步 operating map 含 prompt/skill 引用、required output、human intervention point，一目了然。 |
|  新增 `templates/intel-xpu-hardware-reference.md` | 加入了 B60/B70 硬件参考。但做法与我建议的不同——见下文详细评价。 |
| ✅ `migration-result-report-template.md` Target hardware 字段加入了 `intel-xpu-hardware-reference.md` 引用 | 交叉引用到位。 |
| ✅ `intel-xpu-workflow-migration-flow.md` Capacity gate 加入了 hardware reference 引用 | 交叉引用到位。 |
| ✅ `skills/01-feasibility-analysis-skill.md` 加入了 hardware reference 引用 | 交叉引到位。 |
| ✅ `README.md` review order 更新，新增 migration-workflow 和 hardware reference | 导航结构清晰。 |

---

## 关于 B60/B70 Spec 的做法评价

你选择的做法是 **"evidence-only worksheet"**：不填具体 spec 数字，只记录从 Dasiwa 迁移证据中已知的事实，其余留空要求实测。

这个做法 **在文档严谨性上是正确的**——它避免了凭空编造 spec 带来的误导。但从你的需求（"更容易评估筛选平台"）来看，**当前本还差半步**。具体分析如下：

### 👍 做得好的部分

1. **"Required hardware fields" 表**（L20-34）非常实用，给出了必须采集的字段和获取命令
2. **"Capacity routing worksheet"**（L39-45）用 Dasiwa 实际证据出了路由判断，比我原来建议的"猜测式 spec 表"更诚实
3. **"Known Dasiwa capacity lesson"**（L67-77）把关键经验浓缩为可复用规则，而不是 spec 数字
4. 明确写了 **"Do not invent B60/B70 specs from environment names"** — 这避免了一个真实的坑

### 🟡 建议补充：加入 **"已知公开 spec" 参考段**

当前版本的问题是：一个新工程师拿到文档后，在实测 **之前** 没有任何参考点来做初步筛选。比如拿到一个新 workflow，想判断 "应该去 B60 上试还是直接找更大的卡"，除了 "24 GB-class" 这个从 Dasiwa 来的标签，没有其他信息。

**建议**：在 `intel-xpu-hardware-reference.md` 中增加一个 **"Public spec reference"** 段（与"从移证据中得到的"分开），明确标注这些是公开信息而非实测值：

```markdown
## Public spec reference (not validated by this repo)

These are publicly available Intel specifications for planning purposes only.
They do NOT replace measured values from `Required hardware fields` above.

| GPU | Architecture | Announced VRAM | Memory type | TDP | Source |
|---|---|---|---|---|---|
| Arc B580 | Battlemage (BMG-G21) | 12 GB | GDDR6 | 150W | Intel ARK |
| Arc A770 | Alchemist (ACM-G10) | 16 GB | GDDR6 | 225W | Intel ARK |
| Arc A750 | Alchemist (ACM-G10) | 8 GB | GDDR6 | 225W | Intel ARK |
| Data Center GPU Flex 170 | ATS-M1 | 12 GB | GDDR6 | 75W | Intel product brief |
| Data Center GPU Max 1550 | Ponte Vecchio | 128 GB | HBM2e | 600W | Intel product brief |

> ⚠️ The "B60" and "B70" labels used in Dasiwa migration artifacts are
> **deployment environment labels**, not necessarily official Intel product names.
> The actual GPU model inside each environment must be confirmed via `xpu-smi`
> or platform inventory before using the capacity gate.
```

**价值**：
- 工程师可以在 **采购/分配** 阶段做粗筛："这个 workflow 估算需要 20GB，A770 只有 16GB，可以直接排除"
- 与现有的 evidence-based 体系不冲突——公开 spec 和实测值明确分层
- 解答了你的核心问题："是不是需要加入 B60/B70 的 spec" — **需要加，但应该加公开 spec + 环境名到实际 GPU 的映射说明，而不是把环境标签当 spec**

---

## 其他本轮发现的小问题

### 1. `migration-workflow/README.md` 表格内容被截断

Step-by-step operating map 表（L33-45）中所有行的 "Required output" 和 "Human intervention point" 列都被 `[...]` 截断了。这是 GitHub 渲染还是实际文件的问题？建议确认 Markdown source 中表格单元格没有被截断——**这个表是整个操作手册的核心**，截断会导致关键信息丢失。

### 2. B60 的 VRAM 需补充B70 信息。 

文档中反复说 "B60 / 24 GB", 补充b70 是32GB显存这个信息。 。

**建议**：在 hardware reference 的 B60 行明确说明：`"B60" is a deployment environment label used in this project, not an Intel product name. The actual GPU model is [X] with 24 GB VRAM.` 或者如果确实是保密信息，写 `internal hardware; confirm GPU model from platform inventory`。

### 3. `migration-workflow/README.md` 和 `intel-xpu-workflow-migration-flow.md` 存在重叠

现在有两个文件都描述了 11 步流程和 result classes：
- `migration-workflow/README.md`（新增的执行入口）
- `intel-xpu-workflow-migration-flow.md`（原来的核心文件）

README 说 "use migration-workflow/README.md as entrypoint"，flow 是 "lower-level reference"。这个分层是合理的，但 **result classes 表在两个文件中各写了一遍**，未来维护时可能不同步。

**建议**：`migration-workflow/README.md` 的 result classes 段落改为引用：`See intel-xpu-workflow-migration-flow.md#result-classes for the canonical definitions.`

### 4. 从"可落地"角度：缺一个 Quick Start 示例

`migration-workflow/README.md` 结构很好，但全是表格和规则。建议在文件末尾加一个 **"Quick Start: your first migration"** 段，用 3-5 行伪操作展示一次最简流程：

```markdown
## Quick start example

1. Fill `templates/intel-xpu-hardware-reference.md` with `xpu-smi` output from target machine
2. Run Step 1 prompt with your workflow JSON → get `01-feasibility.md`
3. If initial_class is "capacity risk", stop and discuss fidelity tradeoff with stakeholder
4. Otherwise continue Step 2-7 sequentially, producing each artifact
5. At Step 8, use capacity decision matrix to classify → fill `migration-result-report-template.md`
```

---

## 总评

| 维度 | 状态 | 评分 |
|---|---|---|
| 方法论完整性 | ✅ 三轮迭代后非常完整 | 9/10 |
| 可执行性 | ✅ migration-workflow/README.md 是重大提升 | 8/10 |
| 硬件参考 | ⚠️ 框架到位，差公开 spec 和环境名澄清 | 7/10 |
| 交叉引用 | ✅ 所有关键文件已互相引用 | 9/10 |
| 维护负担 | ⚠️ result classes 重复定义需注意 | 7/10 |

**总结**：这已经是一套 production-ready 的迁移操作系统了。补上公开硬件 spec 参考段 + 澄清 "B60/B70" 是环境名而非产品名，就可以 promote 到 canonical docs。
