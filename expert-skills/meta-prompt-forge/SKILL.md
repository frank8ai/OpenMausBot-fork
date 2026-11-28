---
name: meta-prompt-forge
description: "软件架构师与幕僚长按需加载的 L0-L6 元提示词铸造、KV Cache 前缀拓扑、Promptfoo 去偏回归与 HMAC 签名验真型 12 维异构冷审规约。"
---

# L0-L6 Meta-Prompt Forge & 12-Dim Cold Gate (`meta-prompt-forge`)

## When to Use
- 铸造或重构任意 Bot 的 `SOUL.md`（L0–L6 全层架构）或提纯按需 `SKILL.md`。
- 执行 12 维客观冷审（满分 `120`，通过线 `>= 108`）与 Promptfoo 对抗回归。

## Excluded When (DO NOT)
- **DO NOT** 由同一模型族自写自审（同族盲区会掩盖系统性偏差；优先级最高硬拦截 `EXIT 30`）。
- **DO NOT** 在生产门禁依赖手填 `--author-family` / `--reviewer-family`（默认 fail-closed 拦截 `EXIT 2`；必须传 `--orchestrator-meta` 并经 HMAC-SHA256 与 `hmac.compare_digest` 物理验签通过）。
- **DO NOT** 在 `SOUL.md` / System 头部放置动态时间戳、会话 ID 或 `autoRecall`（会击穿 96%+ KV Cache 前缀命中率；一律沉底 User Tail）。
- **DO NOT** 堆砌无因果纯禁止咆哮或突破体积红线（`SOUL.md <= 24,000 B`、`SKILL.md <= 120` 行）。

## 1. 黄金七步铸造流水线 (S1–S7)
1. **S1 [疤痕裁剪]**：执行 80% Delete Ritual，删去冗余旧警告与隐含假设。
2. **S2 [L0–L1 权力链锚定]**：锁定 `Root > System > Developer > User > Guideline > Untrusted Data` 六级信任链、`scope_do` 与 `non_scope_never`。
3. **S3 [Explain the Why]**：每条红线附底层失效后果 + 正向替代动作 + 跨域正/边缘反例。
4. **S4 [KV Cache 前缀物理锁死]**：固定顺序 `Sorted Tools -> Static System (L0-L6) -> Append-Only History -> Dynamic User Tail`。
5. **S5 [L2–L6 契约闭合]**：含 `L3` 工具链与铁律；结构化输出 `strict: true`、`additionalProperties: false`、`Reasoning` 字段严格先于 `Conclusion`/`Verdict`；含 D0–D4 容灾阶梯。
6. **S6 [12 维静态 + 异构冷审]**：先跑 `scripts/audit_12dim_soul.py --orchestrator-meta <meta.json>`（含必填 6 字段 HMAC 验真与 `candidate_sha256` 物理产物摘要绑定），再由异构强模型族执行 12 维冷审（`>= 108/120`）。
7. **S7 [Promptfoo 回归]**：`npx promptfoo eval`（`>= 20` 边界用例）+ `redteam` 覆盖注入与 PII 泄露。

## 2. 确定性静态审计脚本与防伪签名契约
```bash
# 生产门禁（默认 fail-closed）：必传 --orchestrator-meta 并完成 HMAC-SHA256 验真
python scripts/audit_12dim_soul.py --target <SOUL_or_SKILL.md> --kind <soul|skill> --orchestrator-meta <runtime_meta.json>
# 本地预检（仅限开发自测）：加 --allow-self-check，报告强制标记 LOCAL_SELF_CHECK_ONLY 且 production_gate_eligible: false
python scripts/audit_12dim_soul.py --target <SOUL_or_SKILL.md> --kind <soul|skill> --allow-self-check --author-family gemini --reviewer-family anthropic
```
- **`--orchestrator-meta` 规范**：必填 `author_model`, `candidate_sha256`, `issuer`, `issued_at`, `reviewer_model`, `run_id` 6 字段，强制绑定候选产物 sha256 摘要并按规范计算 `signature`；摘要不匹配直接拦截 `EXIT 2 (DIGEST_MISMATCH)`。
- **退出码**：`0` (`PASS`)、`2` (`PROVENANCE_UNVERIFIED` / `SPEC_INVALID`)、`30` (`BLOCKED_SAME_FAMILY`)。
- **LLM 冷审汇报结构**（`strict: true`, `additionalProperties: false`）：`reasoning -> dimension_scores -> total_score -> verdict`。

## Verification
运行 `pytest tests/test_phase1_skills.py -k meta_prompt_forge` 全绿：验证 HMAC 签名验真、候选产物摘要强制绑定与不匹配拦截 `EXIT 2`、未签名/手填拦截 `EXIT 2`、同族最高优先级拦截 `EXIT 30` 与 CRLF 兼容。
