# 单兵 Bot 内部并行子代理架构增补规范 (v3.1-INTRA-BOT-ADDENDUM-FINAL)

> **归属定位**: 配合 [SPEC-MAUSBOT-ORCHESTRATION-v3.0-FINAL.md](./SPEC-MAUSBOT-ORCHESTRATION-v3.0-FINAL.md) 构成“宏观器官分工（Multi-Bot 黑板协同）+ 微观酶反应（Intra-Bot 瞬态子代理）”双层完整闭环。  
> **封板状态**: `FINAL FROZEN`（停止纸面迭代，直接进入 P0 编码与真实任务实测）  
> **实施策略**: **P0 先行开放 `SCOUT` + `VERIFIER`（零写冲突、立竿见影降本提速）；`DISJOINT_BUILDER`（文件白名单锁）作为 P1 增量解锁。**

---

## 一、 吸收裁决与防回退红线

1. **严禁退回教条微米节流**：延续 v3.0 铁律，子代理派发与失败诊断不卡死 `<1KB/<2KB` 教条上限；保证充分自完备上下文与 `<= 2~4KB` 最小失败断言切片。
2. **严禁将生产编码一刀切给 Flash-Lite**：仅 `SCOUT`（只读探路）与 `VERIFIER`（高噪日志提炼）使用廉价快模型；`DISJOINT_BUILDER` 写代码必须使用主力均衡/强模型，靠 Prefix Caching 降本，绝不以降低推理质量换单价。
3. **同源基建复用（拒绝双套轮子）**：单 Bot 内部子代理复用 v3.0 的 `PromptSerializer`（L0/L1/L2）、`SubBotLLMOutputSchema`、`BotHandoffDeltaV3` 遥测与 `read_artifact({ id })` 校验层，禁止另起炉灶重写两套调度器。

---

## 二、 任务四象限分流矩阵与「侦察—拍板—施工」三拍流

| 角色类型 | 典型场景 | 并行许可 | 模型算力 | 隔离策略 | 上线阶段 |
| :--- | :--- | :---: | :--- | :--- | :---: |
| **`SCOUT`（只读侦察）** | 并发扫多目录调用链、多份 API 文档检索、多维度竞品搜索 | **强推荐 (3~5并发)** | 廉价快模型 (Flash/Haiku) | 仅挂载只读工具（默认 `GENERAL` 轻量配置） | **P0** |
| **`VERIFIER`（高噪清洗）** | 运行全量测试/构建、提炼数万行终端报错切片 | **隔离执行** | 廉价快模型跑并压缩 | `allowedCommandPrefixes` 白名单 + `shell:false` + 独立 `TMPDIR`/`PORT=0` | **P0** |
| **`DISJOINT_BUILDER`（解耦写）** | 契约已锁定的独立模块实现、批量互不干扰单测补全 | **有条件 (3~5并发)** | 主力均衡模型 | 最近祖先目录 `realpath` 路径白名单锁（重干扰才开 Worktree） | **P1** |
| **强耦合核心推理** | 跨文件联动重构、状态机设计、复杂 Bug 根因定性 | **严禁并行** | 主 Bot 强推理核串行 | 主上下文内直接收敛 | **始终串行** |

**标准三拍节奏（Scatter → Gather/Lock → Execute）**：
1. **Scatter（并发侦察）**：主 Bot 拆出 3~5 个互不重叠的只读问题派发给 `SCOUT`，子代理各自吞吐海量检索后只吐出带**精确文件路径 + 行号锚点**的结构化摘要，上下文即刻 GC。
2. **Gather & Lock（主核拍板）**：主 Bot 在纯净上下文中汇总摘要（通常 `< 3,000 Tokens`），一次性锁定接口契约与互不重叠的文件所有权白名单。
3. **Execute & Verify（施工与隔离校验）**：1~2 个强关联文件由主 Bot 直接写完；≥3 个独立模块才在 P1 扇出 `DISJOINT_BUILDER`，并在交付前由 `VERIFIER` 清洗报错后汇总给主 Bot 统一接线。

---

## 三、 二阶工程加固与 4 项代码级暗坑防线

### 1. 递归深锁（`Max Depth = 1`）与批次并发上限
- 被拉起的内部子代理 Tool Schema 中**物理剥离 `spawn_subagent` / `invoke_subagent`**，从结构上杜绝“子生孙”无限套娃炸弹；
- `concurrencySlotLimit`（`1~5`，默认 `4`）与 `cacheWarmup` 作为**批次调度参数（`IntraBotBatchRequestSchema`）**由主 Bot 统一传入，防止同批子代理各自声明冲突上限。

### 2. 分组 `Wait-for-TTFT` 错峰缓存预热 + 异常 Fail-Open
- **按 `(modelId + L0/L1 Prefix Hash)` 分组预热**：仅同模型、同 Tool Schema、同冻结前缀的兄弟子代理互享缓存与预热队列；混发不同模型（如 `SCOUT` 与 `BUILDER`）时各组独立发车，互不干等。
- **TTFT 门控与首包异常立即解锁（Fail-Open）**：当组内共享前缀 `≥ 1,024 Tokens` 时，先发组内第 1 个请求，一旦收到首 Token 响应、遇到 **首包异常/429 报错（Fail-Open 立即释放）** 或触达 `2500ms` 兜底上限，立刻并发放行组内第 2~N 个子代理。

### 3. `VERIFIER` 受控命令白名单 + 产物/端口隔离（P0 焊死只读防线）
- 仅关闭 `allowFileWriteTools: false` 挡不住 Shell 重定向（`>`）或快照覆写（`jest -u`）；
- `VERIFIER` 必须启用 `allowedCommandPrefixes` 白名单，以 `shell: false`（`execFile`）执行预置测试/构建/Lint 命令，物理屏蔽 `&&`、`;`、`>`、`|` 等拼接符与快照写入参数；
- 执行环境注入独立 `TMPDIR` / `COVERAGE_DIR` 与动态端口 `PORT=0`，防多进程踩踏 `.tsbuildinfo` 或 `EADDRINUSE`。

### 4. 新建文件祖先 `realpath` 校验 + 路径分隔符防越权（P1 `DISJOINT_BUILDER`）
- 子代理新建文件时目标尚不存在，直接 `fs.realpathSync` 会抛 `ENOENT`。拦截器必须**向上递归查找最近一个已存在的父目录**执行 `fs.realpathSync`，再拼回剩余新路径段；
- 前缀比对必须强制补全末尾路径分隔符（`prefix + path.sep`），严防 `/src/auth` 误放行 `/src/auth-admin`；
- `index.ts`、`package.json`、`tsconfig.json`、路由注册表等共享入口文件列入 `forbiddenSharedFiles`，统一由主 Bot 单线程接线。

---

## 四、 终版无冗余契约扩展 (`contracts/intra-bot-subagent-v3.1.ts`)

```typescript
import { z } from 'zod';
import { BotTaskEnvelopeV3Schema } from './orchestration-v3';

// 1. 单条单兵子代理信封（去除重复枚举与批次字段；SCOUT/VERIFIER 默认装配轻量 GENERAL 配置）
export const IntraBotSubagentEnvelopeSchema = BotTaskEnvelopeV3Schema.extend({
  invocationScope: z.literal('INTRA_SUBAGENT'),
  maxDepth: z.literal(1), // 运行时校验：Tool Registry 物理剥离 spawn 类工具
  isolationPolicy: z.discriminatedUnion('role', [
    z.object({
      role: z.literal('SCOUT'),
      allowFileWriteTools: z.literal(false),
    }),
    z.object({
      role: z.literal('VERIFIER'),
      allowFileWriteTools: z.literal(false),
      allowedCommandPrefixes: z.array(z.string()).min(1), // 如 ['pnpm test', 'pnpm tsc', 'pnpm lint']
      isolatedEnv: z.record(z.string(), z.string()),    // 如 { PORT: '0', TMPDIR: '...' }
    }),
    z.object({
      role: z.literal('DISJOINT_BUILDER'),
      allowedWritePrefixes: z.array(z.string()).min(1), // 经最近祖先 realpath + path.sep 校验
      forbiddenSharedFiles: z.array(z.string()),        // 如 ['package.json', 'src/index.ts']
    }),
  ]),
});

export type IntraBotSubagentEnvelope = z.infer<typeof IntraBotSubagentEnvelopeSchema>;

// 2. 批次并发派发参数（由主 Bot 调 spawnSubagents(batch) 时统一传入，按 modelId+prefixHash 分组预热）
export const IntraBotBatchRequestSchema = z.object({
  concurrencySlotLimit: z.number().int().min(1).max(5).default(4),
  cacheWarmup: z
    .object({
      enabled: z.boolean().default(true),
      waitForFirstTokenMsCap: z.number().int().max(3000).default(2500),
    })
    .default({ enabled: true, waitForFirstTokenMsCap: 2500 }),
  tasks: z.array(IntraBotSubagentEnvelopeSchema).min(1).max(10),
});

export type IntraBotBatchRequest = z.infer<typeof IntraBotBatchRequestSchema>;
```
