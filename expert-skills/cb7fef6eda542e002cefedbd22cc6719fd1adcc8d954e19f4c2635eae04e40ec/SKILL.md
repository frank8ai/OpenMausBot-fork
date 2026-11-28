---
name: l0-l6-meta-prompt-forge
description: Anthropic/OpenAI/Gemini/Grok 顶配 L0-L6 SOUL.md 铸造流水线、Promptfoo 二元解耦门禁与 12 维量规冷审规约。
---

# L0-L6 Meta-Prompt Forge & 12-Dimension Gate

## 1. 适用边界
- 创建新智能体 `SOUL.md`、重构存量提示词、修复格式漂移或上下文衰退。
- 执行 12 维冷审裁决（满分 120，通过线 >= 108）与 Promptfoo CI/Redteam 对抗回归。

## 2. 黄金七步铸造流水线 (S1-S7)
1. **S1 [防疤痕组织裁剪 (80% Delete Ritual)]**：剔除为前代弱模型编写的冗余警告、全大写咆哮（CRITICAL/NEVER）与空泛形容词；剥离编写者隐性假设（Theory of Mind Decoupling）。
2. **S2 [L0-L1 本体与权力链锚定]**：遵循 `Root > System > Developer > User > Guideline > Untrusted Data` 六级指令链，明确 `scope_do`、`non_scope_never` 与显式冲突裁决序列。
3. **S3 [Explain the Why 正向替换]**：每条红线必须阐明底层系统性灾难后果与正向替代动作，消除“粉色大象效应（Pink Elephant Rebound）”；抽象规则辅以异构域示例防止过拟合。
4. **S4 [KV Cache 前缀物理锁死]**：静态系统定义、工具契约与安全边界严格置顶（满足 Anthropic 512~4096 / OpenAI 1024+128块 / Gemini 1024~2048 / xAI 128块+`x-grok-conv-id`）；实时时间戳、会话 ID 与外部数据沉底至用户消息尾部 `<untrusted_input>`。
5. **S5 [L2-L6 状态机、Strict Schema 与 D0-D4 容灾闭合]**：
   - JSON Schema 强制 `strict: true`、`additionalProperties: false`、全字段入 `required`（可空字段用 `["type", "null"]`），且思考链字段排在结论字段之前（Reasoning-before-Conclusion）。
   - 定义 D0（正常自闭环）至 D4（物理熔断升级人类）的确定性降级阶梯。
6. **S6 [12 维冷审脚本硬校验]**：运行 `audit_12dim_soul.py` 执行确定性静态 AST/结构扫描 + 单一失效模式二元裁判（One Judge per Failure Mode + Position Swap + Cross-Family Grader），总分 >= 108 且零一票否决项方可放行。
7. **S7 [Promptfoo 回归与 Redteam 渗透]**：执行 `promptfoo eval`（>=30 边缘用例，`is-json` / `cost` / `latency` / `javascript` / 去偏 `llm-rubric`）与 `promptfoo redteam run`（覆盖 `mcp`, `pii`, `bfla`, `bola`, `jailbreak`）。
