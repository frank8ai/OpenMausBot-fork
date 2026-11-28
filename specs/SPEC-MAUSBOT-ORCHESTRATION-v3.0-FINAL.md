# MausBot 多 Agent 协同与黑板上下文编译器架构终版施工规范 (v3.0-FROZEN-P0)

> **状态**: `FROZEN FOR P0 EXECUTION`  
> **适用范围**: OpenMausBot / MausBot 全团队专家矩阵（涵盖工程研发域与非代码业务/研究/设计/文档域）  
> **核心原则**: 质量与一次通过率（FPY）优先；确定性编译器优先；模型产出层与运行时调度壳层物理分离；停止纸面空转，立即按 P0 MVP 裁剪线交付代码并在 10~20 个真实任务中用遥测数据校准。

---

## 一、 必拆的 4 个运行时暗坑与终版纠偏

### 1. Schema 职责物理分离（防 LLM 伪造运行时指标）
- **铁律**：绝不允许将 `telemetry`、`engineeringStats`、`strikeCount`、`idempotencyKey` 塞进传给大模型 Structured Output 的 Schema 中，否则模型会编造 Token 数与修改行数。
- **架构解法**：拆分为 **模型产出契约（`SubBotLLMOutputSchema`）** 与 **运行时调度增量（`BotHandoffDeltaV3`）**。子 Bot 仅输出业务结果或契约异议；所有统计、哈希、重试计数、校验结果与日志落盘均由 TypeScript Runtime Harness 自动计算包裹。

### 2. DTO 与 Prompt 分离（`PromptSerializer` 保护 L1 前缀缓存）
- **铁律**：严禁直接对 `BotTaskEnvelopeV3` 执行 `JSON.stringify` 注入 Prompt。尤其严禁将递增的 `expectedBlackboardVersion` 放入 L1 前缀，否则并行兄弟节点中任一节点先提交都会瞬间击穿其余节点的 L1 缓存。
- **架构解法**：`Context Compiler` 必须实现专用 `PromptSerializer`：
  - **L0（System Prompt 顶部，周/月级冻结，≥ 1024~2048 Tokens）**：固定 Bot 角色 + 全局安全铁律 + Tool Schemas + `SubBotLLMOutputSchema`。**绝对禁止时间戳、随机 UUID、会话计数**。
  - **Cache Breakpoint #1**
  - **L1（Frozen Task Context，主任务周期冻结）**：`parentTaskId` + 主任务初始冻结契约快照 + 黑板只读索引（**不含递增版本号**）。同主任务下所有并行子 Bot 共享 L1 缓存。
  - **Cache Breakpoint #2**
  - **L2（User Message，单次派发瞬态切片，弹性 800~3500 Tokens）**：`subtaskId`、`attempt`、`goal`、`upstreamSlices`（确定性抽取）、1 正 1 反对齐样例、`forbiddenScope`、`acceptanceCriteria`、简短文件别名列表。
  - **Pure Metadata（仅留调度器内存，不进 Prompt）**：`expectedBlackboardVersion`、`idempotencyKey`、`limits`。

### 3. 简短指针别名与哈希校验下沉（防 LLM 抄错 64 位 SHA-256）
- **铁律**：禁止让 LLM 在工具参数中手抄 64 位 `sha256` 哈希。
- **架构解法**：L2 Prompt 中仅暴露 `{ id: "ART-01", summary: "...", lineRange?: "L20-L85" }`；模型仅调用 `read_artifact({ id: "ART-01" })`。底层 Tool Harness 根据 `id` 查找真实 `uri` 与 `sha256` 并执行一致性校验；若文件已被篡改/过期，底层直接返回 `STALE_POINTER` 并触发刷新或升级，**不扣除子代理 `Strike` 次数**。

### 4. `maxDiffLines` 阶梯化与软警告降级（防误杀正常代码）
- **铁律**：取消 `150 行` 作为全场景硬失败门禁，防止子代理写出晦涩代码或无故触发两振熔断。
- **架构解法**：按任务复杂度分级配置软阈值（`T1: 150`, `T2: 400`, `T3: 800`），超限时仅在 `engineeringStats.diffBudgetExceeded` 置 `true` 供代码评审员重点审查，不直接判 `FAILED`。

---

## 二、 终版机器可校验契约 (`contracts/orchestration-v3.ts`)

```typescript
import { z } from 'zod';

// ============================================================
// 1. 仅传给 LLM Structured Output 的极简产出契约
//    (严禁包含 telemetry / strikeCount / idempotencyKey / stats)
// ============================================================
export const SubBotLLMOutputSchema = z.object({
  outcome: z.enum(['COMPLETED', 'CONTRACT_CONFLICT']),
  outputData: z.record(z.string(), z.unknown()).optional(),
  conflictEvidence: z.string().max(1024).optional(), // 仅当发现上游契约自相矛盾时填写
});

export type SubBotLLMOutput = z.infer<typeof SubBotLLMOutputSchema>;

// ============================================================
// 2. 调度器内存 DTO (严禁直接 JSON.stringify 进 Prompt，须经 PromptSerializer 映射)
// ============================================================
export const BotTaskEnvelopeV3Schema = z.object({
  // --- L1 共享前缀字段 (同主任务下并行兄弟节点一致) ---
  parentTaskId: z.string(),

  // --- Pure Runtime Metadata (仅留内存，不序列化进 Prompt) ---
  expectedBlackboardVersion: z.number().int().nonnegative(),
  idempotencyKey: z.string(), // 格式: `${subtaskId}:attempt-${attempt}`
  limits: z.object({
    maxExecutionTokens: z.number().int().positive(), // T1: 8k, T2: 16k, T3: 32k
    maxToolCalls: z.number().int().positive(),
    timeoutMs: z.number().int().positive(),
  }),

  // --- L2 瞬态切片字段 (位于 Cache Breakpoint #2 之后) ---
  subtaskId: z.string(),
  attempt: z.union([z.literal(1), z.literal(2)]),
  tier: z.enum(['T1_FAST', 'T2_STANDARD', 'T3_CRITICAL']),
  goal: z.string().max(300),

  // 领域判别联合：非代码 Bot 零 Git 基建负担，代码 Bot 保留 Worktree 强隔离
  executionProfile: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('GENERAL'),
      draftNamespace: z.string(), // e.g. "drafts/task-01/research/attempt-1"
    }),
    z.object({
      kind: z.literal('ENGINEERING'),
      worktreePath: z.string(),
      branchName: z.string(),
      softDiffWarningLines: z.number().int().positive(), // T1:150, T2:400, T3:800 (仅软警告)
    }),
  ]),

  // 4 选 1 确定性高信噪比上下文 (弹性 800 ~ 3500 Tokens)
  context: z.object({
    upstreamSlices: z.record(z.string(), z.unknown()),
    contractRules: z.array(z.string()),
    forbiddenScope: z.array(z.string()),
    examples: z
      .object({
        good: z.string(),
        bad: z.string().optional(),
      })
      .optional(),
  }),

  // 内部存真实 uri+sha256，PromptSerializer 仅向模型暴露 { id, summary, lineRange }
  artifactPointers: z
    .array(
      z.object({
        id: z.string(), // 简短别名如 "ART-01"
        summary: z.string().max(160),
        uri: z.string(),
        sha256: z.string().length(64),
        lineRange: z.string().optional(),
      }),
    )
    .optional(),

  // 验收门禁 (DoD) —— 主观类门禁严禁模型自评
  acceptanceCriteria: z.object({
    outputSchemaName: z.string(),
    verifierType: z.enum(['CODE_TEST', 'SCHEMA_RULE', 'INDEPENDENT_CRITIC']),
    checks: z.array(z.string()).min(1),
  }),
});

export type BotTaskEnvelopeV3 = z.infer<typeof BotTaskEnvelopeV3Schema>;

// ============================================================
// 3. Runtime Harness 自动拼装的完整状态增量 (写黑板/门禁/遥测用)
// ============================================================
export const BotHandoffDeltaV3Schema = z.object({
  subtaskId: z.string(),
  idempotencyKey: z.string(),
  status: z.enum([
    'SUCCESS',
    'NEED_RETRY',        // Strike 1: 本地确定性校验失败，携精确断言切片原地修正
    'CONTRACT_CONFLICT', // 上游契约矛盾，干净暂停并上报证据
    'STALE_POINTER',     // 工具层检测到产物哈希变更，刷新重派（不计入 Strike）
    'CIRCUIT_BROKEN',    // Strike 2: 触发两振熔断，严禁同级模型第 3 次盲改
  ]),
  strikeCount: z.union([z.literal(0), z.literal(1), z.literal(2)]),

  outputData: z.record(z.string(), z.unknown()).optional(),
  artifactUri: z.string().optional(),

  engineeringStats: z
    .object({
      filesChanged: z.number().int().nonnegative(),
      insertions: z.number().int().nonnegative(),
      deletions: z.number().int().nonnegative(),
      diffBudgetExceeded: z.boolean(), // 软警告标记，不直接判 FAILED
      patchUri: z.string().optional(),
    })
    .optional(),

  verification: z.object({
    passed: z.boolean(),
    verifierType: z.enum(['CODE_TEST', 'SCHEMA_RULE', 'INDEPENDENT_CRITIC']),
    summary: z.string().max(400),
  }),

  telemetry: z.object({
    durationMs: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    cachedInputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    cacheHitRate: z.number().min(0).max(1),
  }),

  diagnostics: z
    .object({
      errorSnippet: z.string().max(2048),
      conflictEvidence: z.string().max(1024).optional(),
      traceLogUri: z.string(),
    })
    .optional(),
});

export type BotHandoffDeltaV3 = z.infer<typeof BotHandoffDeltaV3Schema>;
```

---

## 三、 MVP 分阶段施工裁剪线 (严防过度工程化)

| 核心模块 | P0 立即落地（1~2 天跑通闭环，禁止过度建设） | P1 演进补全（跑满 10~20 个真实任务后再启动） |
| :--- | :--- | :--- |
| **共享黑板** | 本地 JSON / SQLite 存储 + `drafts/<parent>/<subtask>/attempt-<n>` 独立目录 + 简单文件锁/串行提交 | 分布式 CAS 乐观锁与高并发冲突解决 |
| **上下文编译器** | 纯确定性 TS `PromptSerializer` + L0/L1/L2 缓存断点 + `read_artifact({ id })` 哈希拦截 | 针对海量非结构化网页/长文档的异步 Flash 抽取管道 |
| **契约与门禁** | 拆分 `SubBotLLMOutputSchema` 与 Runtime Harness + Zod 机检 + 本地单测执行 | 跨分支语义一致性自动断言引擎（P0 先由主控/TPM 汇总核验） |
| **熔断与遥测** | `Strike 2` 硬冻结 + `CONTRACT_CONFLICT` 干净暂停 + `maxEscalations = 2` 防死循环 + 落盘 4 项 `telemetry` 日志 | 可视化成本看板与自适应模型动态降级路由 |

---

## 四、 终版毕业验收门禁 (10~20 个真实任务实测标准)

只有当 P0 在 **10~20 个真实 MausBot 业务流转任务** 中全部验证以下 3 项指标，才允许宣告 v3.0 正式毕业定版并启动 P1：
1. **前缀缓存真实命中**：`telemetry.cacheHitRate`（`cachedInputTokens / inputTokens`）稳定在 **≥ 70% ~ 80%**；
2. **一次通过率跃升**：`FPY` **≥ 85%**，且触发 `CONTRACT_CONFLICT` 时能干净暂停并附带可定位证据；
3. **端到端总成本下降**：对比旧版聊天接力模式，相同复杂度多 Bot 任务的端到端总 Token 账单显著下降，产出质量持平或更高。
