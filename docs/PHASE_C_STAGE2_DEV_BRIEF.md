---
title: Phase C Stage 2 实施工单 Brief（面向全栈开发）
status: READY_FOR_DISPATCH
phase: Phase C (Cognitive Bridge & Guardrails)
target_bot: "@全栈开发"
spec_source: "C:\\Users\\frank\\Documents\\frank\\Projects\\OpenMausBot\\docs\\SPEC_PHASE_C_COGNITIVE_BRIDGE.md"
branch: feat/phase-c-micro-loop-cognitive-bridge
base_commit: 692004fa9
worktree_path: "C:\\Users\\frank\\Documents\\frank\\Projects\\OpenMausBot-worktree-phase-c"
date: 2026-11-27
---

# Phase C Stage 2 实施工单 Brief（可直接派发 `@全栈开发`）

## 1. 工作区初始化（强制隔离，禁动主仓当前分支）
- **OpenMausBot 主仓**（`C:\Users\frank\Documents\frank\Projects\OpenMausBot`）当前停留在 `fix/antigravity-prevent-account-drift`，**严禁强切主仓分支**。
- 请从 `main`（`692004fa9`）创建独立 worktree 与特性分支：
  ```powershell
  git -C "C:\Users\frank\Documents\frank\Projects\OpenMausBot" worktree add `
    "C:\Users\frank\Documents\frank\Projects\OpenMausBot-worktree-phase-c" `
    -b feat/phase-c-micro-loop-cognitive-bridge main
  ```
- 将规格文档 `OpenMausBot/docs/SPEC_PHASE_C_COGNITIVE_BRIDGE.md` 与本 Brief 一并拷入该 worktree 纳入本次特性分支提交。
- **Harness-Runner-Kit** 本地路径已确认：`C:\Users\frank\Documents\frank\Projects\Research\Harness-Runner-Kit`（`main @ 031fa6b`，远端 `https://github.com/frank8ai-workspace/Harness-Runner-Kit.git`，基线 `120/120 PASS`）。原则上**零修改 HRK 源码**，仅通过 CLI 协议防腐调用。

## 2. 必须实现的四项核心模块与精确分层路径

严格遵守单向无环分层：`contracts/ → config/ → repo/ → service/ → runtime/ → routes`（`service/` 严禁直接导入 `../runtime/` 或 `node:child_process`）：

### 模块 A：无感摩擦捕获器 (Friction Sniffer) & 原子锁账本
1. `server/micro-loop/contracts/friction-event.schema.ts`
   - 导出 `FrictionEventPayloadSchema`、`SignedFrictionEventSchema`、`computeContextHash`、`computeFrictionFingerprint`、`signFrictionEvent`；
   - 强制字段：`context_hash`, `correction_prompt`, `failed_output`, `timestamp`, `repo_slug`, `event_id`, `fingerprint_id`, `signal_kind`, `bot_id`, `thread_id`, `domain`, `producer_model`, `hmac_sha256`。
2. `server/micro-loop/contracts/ports.ts`
   - 导出 `HARNESS_EXIT_CODES`（与 HRK `V22_EXIT_CODES` 1:1 映射 `0,1,2,20,21,22,23,30,31,32,99`）、`IHarnessBridgePort`、`IFrictionLedgerPort`、`ILkgHotReloadPort`、`LkgActiveManifest`。
3. `server/micro-loop/config/micro-loop.config.ts`
   - 复用 `server/config.ts#DATA_DIR`，落盘根路径 `~/.openmausbot/micro_loop/`（可由 `OMB_DATA_DIR` 覆盖），读取 `OMB_MICRO_LOOP_ENABLED`、`OMB_HRK_ROOT`、`OMB_ORACLE_VAULT_DIR`、`OMB_ORACLE_HMAC_SECRET`。
4. `server/micro-loop/repo/friction-ledger.repo.ts`
   - 实现 `IFrictionLedgerPort`：写入 `~/.openmausbot/micro_loop/friction_events/YYYY-MM-DD.jsonl`；
   - 使用 `fs.openSync(lockPath, "wx")`（`O_CREAT|O_EXCL`）实现 `.write.lock` 并发排他锁 + stale PID/TTL(`5000ms`) 回收 + Full Jitter 退避 5 次（`<= 155ms`）+ `5 MB` 自动滚动（复用 `server/atomic.ts#renameWithRetry`）+ `Q_max = 64` 内存非阻塞降级队列。
5. `server/micro-loop/service/friction-sniffer.service.ts`
   - 0-Token 规则分类器（中英文纠偏正则 + 隐式 Undo / Edit 重试 / `👎`），落盘前**必须**调用 `server/redact.ts` 的 `redactSecretsInText()` + `scrubHeldSecrets()` 脱敏并计算 HMAC-SHA256。
6. 薄旁路挂钩（每个路由新增 `<= 15` 行，try/catch 异步旁路绝不阻塞主请求）：
   - `server/routes/bot-messages.ts`（显式纠偏 + `/edit` 重试）
   - `server/routes/undo.ts`（隐式 Undo）
   - `server/routes/reactions.ts`（隐式 `👎`）

### 模块 B：神经-符号双极编译器与排除边界强检 (Negative Boundary Extraction)
7. `server/micro-loop/contracts/compiled-rule.schema.ts`
   - 导出 `CompiledRuleDraftSchema`：强检 `exclusion_boundaries`（`min(1)`）、`inhibits_patterns`（`min(1)`）、`positive_directives`（`max(3)`）、`contrastive_probes`（至少 1 条 `positive_transfer` + 至少 1 条 `near_miss_counterexample` / `boundary_negative`）；`SYMBOLIC_SCRIPT_0TOKEN` 强制 `estimated_tokens === 0`；`PROMPT_SKILL_BOUNDED` 强制 `<= 400 tokens`。
8. `server/micro-loop/service/neuro-symbolic-compiler.service.ts`
   - 导出 `classifyCompileTarget`、`compileFrictionCluster`、`renderBoundedTailSkillCard`；
   - 确定性规则（Git/路径/符号/正则/JSON/退出码）优先编译为 0-Token 本地脚本；缺失排除边界或负例探针直接返回 `{ ok: false, exitCode: 2 }` 一票否决。

### 模块 C：HRK CLI 防腐桥接、跨模型族盲审 (`EXIT 30`) 与 30s LKG 自动回滚热重载
9. `server/micro-loop/runtime/harness-cli.adapter.ts`
   - 实现 `IHarnessBridgePort`：通过 `execFile`（严禁 shell 拼接防命令注入）调用 `bun run src/cli.ts <distill|oracle-judge|blind-review|promote|rollback|select-skills>`；
   - 秘钥仅经环境变量透传（严禁 CLI 参数传秘钥）；独立超时预算：`select-skills: 5s`、`distill/rollback: 15s`、`blind-review: 30s`、`promote: 60s`、`oracle-judge: 90s`。
10. `server/micro-loop/runtime/lkg-hot-reload.runtime.ts`
    - 实现 `ILkgHotReloadPort`：通过 `server/atomic.ts#writeFileAtomic()` 原子更新 `~/.openmausbot/micro_loop/lkg_active_manifest.json`（配 `lkg_active_manifest.prev.json` 兜底）+ `crypto.timingSafeEqual` HMAC 验签 + `fs.watch`（500ms 防抖）+ `mtimeMs` 轻量热重载（`< 1s`）；
    - Canary 10% 确定性分流：`sha256(thread_id + slug) % 100 < 10`。
11. `server/micro-loop/service/micro-loop-bridge.service.ts`
    - 仅依赖 Ports，串行编排：`distill` → `oracleJudge`（变异杀死率 `= 100%`，存活 `EXIT 31`，篡改 `EXIT 99`）→ `blindReview`（异构路由 Claude/GPT ↔ Gemini，同族拦截 `EXIT 30`，连续 2 次分歧封存 `MANUAL_REVIEW_NEEDED`）→ `promote(shadow→canary→active)` → Fast-Trip `rollback`（`<= 30s` 恢复 LKG + 写 72h 冷却表 `EXIT 32` + 触发热重载）。
12. `server/fast-brain-router.ts`
    - 新增薄辅助 `selectAndInjectMicroLoopSkills()`，全部动态规则仅经 `injectTailSlotContext()` 尾槽注入并调用 `validateTailSlotIntegrity()` 校验 `prefix_intact === true`。

## 3. 绝对红线与本地验收命令 (Done-When)
- **红线**：零外部中间件（Redis/Postgres/SQLite）、零 LangChain 包装、零主界面大日志刷屏、零明文密钥落盘、零直接 `service -> runtime` 导入、零破坏 HRK `120/120` 冻结测试。
- **验收命令**：
  ```powershell
  # 1. OpenMausBot 类型、Lint 与 Phase C 单元/集成测试
  pnpm --dir "C:\Users\frank\Documents\frank\Projects\OpenMausBot-worktree-phase-c" typecheck
  pnpm --dir "C:\Users\frank\Documents\frank\Projects\OpenMausBot-worktree-phase-c" lint
  pnpm --dir "C:\Users\frank\Documents\frank\Projects\OpenMausBot-worktree-phase-c" vitest run server/micro-loop/ server/fast-brain-router.test.ts

  # 2. Harness-Runner-Kit 120/120 零回归验证
  bun test --cwd "C:\Users\frank\Documents\frank\Projects\Research\Harness-Runner-Kit"
  ```
- 完成后交由 `@测试质保员` 执行 DW-3.1 ~ DW-3.4 物理门禁 + AER 契约脚本验证，再由 `@代码评审员` 终审并推送 `feat/phase-c-micro-loop-cognitive-bridge` 发起 PR（等待远端 CI + AER Verify 全绿后合入）。
