# ADR & 根因诊断规格书：OpenMausBot 协调器“假派发 / 假调度”故障穿透审计与系统性硬门禁方案

- **文档编号**：`ADR-20261125-PHANTOM-DISPATCH-GUARD`
- **裁决状态**：`ROOT CAUSE VERIFIED & REMEDIATION SPEC LOCKED (v1.0.0-FROZEN)`
- **审计时间**：`2026-11-25 22:16 CST`
- **审计对象**：`MausBot首席幕僚长` (`9e5114b7-9b56-4c65-ba31-9f5e1067e552`) + OpenMausBot 运行时 (`server/drivers/openai-chat.ts`, `server/drivers/chat-announcement.ts`, `server/drivers/openai-compat.ts`, `server/digest.ts`)
- **物理取证源**（只读核验）：`~/.openmausbot/messages.db`、`~/.openmausbot/runtime.db`、`~/.openmausbot/usage/2026-11.jsonl`、`~/.openmausbot/bots.json`、`~/.openmausbot/bots/9e5114b7-.../SOUL.md`、`~/.openmausbot/workspaces/9e5114b7-.../MEMORY.md`、`Projects/OpenMausBot/server/`

---

## 0. 核心裁决结论 (BLUF)

**“口头宣布已派发、底层零调用”不是偶发幻觉，而是「低思考预算 Flash 模型叙事替代 + BLUF 进度条提示词倒置 + OpenMausBot 引擎反假动作守卫的 5 处正则/架构盲区 + 2PDP 手工台账早已失效」四层缺陷耦合导致的必然系统性故障。**

### 物理实证量化数据（2026-11-18 ～ 2026-11-25）
1. **100% 集中于单一通道/低思考模型**：
   - `openai-compat/gemini-3.8-flash`（当前幕僚长默认席位 `variant: "low"`）：在近 7 天严格口径的 `89` 次派发声明回合中，出现 `6` 次假派发（严格口径 **6.7%**）；放大至今日（`2026-11-25`）全量 `no tool activity observed` 回合审计，**单日即爆发 ≥ 8 起纯零调用假派发**（其中包含直接伪造不存在的线程名 `#架构溯源: 根治调度元数据与内部JSON跨界泄露`）。
   - 对照组：`openai-compat/gemini-3.8-flash-medium`（`0/18`, **0.0%**）、`2026-11-24` 主力的 `gemini-3.8-flash-high`（`233` 回合 **0 起**）、原生 `antigravityAgent/gemini-3.8-flash`（`0/35`, **0.0%**）。
2. **现网紧急灾情（当前仍有 5 条线程处于永久静默假死状态）**：
   截至 `2026-11-25 22:15`，以下 **5 条主线程**最后一条消息均宣称已派发/推进，但 `runtime.db` 中 `active_assignments = 0` 且最后回合 `no tool activity observed`：
   | 线程前缀 | 标题 | 假派发时间 | 已静默假死时长 | 假声明内容 |
   | :--- | :--- | :--- | :--- | :--- |
   | `88103bf0` | 商业化战略 | `12:00:31` | **10h 15m** | `已协调【全栈开发】与【文档版本员】...`（并自造 `[What MausBot... did]` 元数据） |
   | `f1af515e` | 我的aer项目上线规划 | `16:57:58` | **5h 17m** | `[触发 Rework-1 派发全栈开发精准修复 ⏳]` |
   | `8fa18ea3` | bot架构优化方案 | `19:22:56` | **2h 52m** | `[全栈开发手术式修复 P1 缺陷中 ⚙️]` |
   | `feb36d01` | 自动工厂包装成bot | `20:11:09` | **2h 04m** | `[已派发【全栈开发】与【运维工程师】双轨推进 ⏳]` |
   | `7b631f38` | 编排器架构演进 | `20:59:08` & `21:50:38` | **25m（连续2次）** | 连续两轮零调用声称 `立即切换为 AutoFabric 底座无头执行` |
   *(另有今日早先 `146ac05a` 假死 14 分钟后因旧子任务回传意外唤醒；`36bb9b6c` 于 `20:23:54` 假派发后死锁 **95 分钟**直至用户手动催办。)*

---

## 1. 四层耦合根因深度剖析

### 根因一：模型认知层 — 低思考预算 Flash + 80KB 高熵上下文诱发“叙事替代动作”
- **现场证据**（`usage/2026-11.jsonl` & `bots.json`）：
  - 幕僚长默认配置为 `antigravity-local-gateway` (`driverKind: "openai-compat"`) + `gemini-3.8-flash` + `variant: "low"`。
  - 全部 4 起核心取证假派发回合呈现完全一致的遥测指纹：`steps: 1`, `tools: 0`, `toolErrors: 0`, `output: 426–774 tokens`, `outcome: { status: "ok" }`，而输入 Prompt 高达 **`promptBytes.stable = 52.8 KB` + `promptBytes.volatile = 21.8–28.3 KB`（总计 75–81 KB，上下文 30K–42K tokens）**。
- **机理**：在 `variant: "low"` 极低推理预算与高上下文负载下，OpenAI Chat Completions 协议允许模型在任意一步直接输出纯文本并返回 `finish_reason: "stop"`。模型将“生成符合幕僚长风格的格式化进度通报”作为最高概率路径，用**叙事文本替代了结构化 `tool_calls` 块**；一旦首 Token 进入 Markdown 进度条，自回归惯性会顺滑补完“已派发 + 线程名 + 等待凭证”全套辞令并直接停机。
- **负强化放大器**：近 7 天幕僚长调用 `agents_coordinate_bots` 共出现 **`103` 个含失败调用的回合**（`17` 回合 100% 失败、`86` 回合局部失败重试，主因为漏传 `bot_ids`、错误传 `answers` UUID、或对已完结任务发送确认回执），工具调用摩擦进一步诱使低推理模型“口头跳过工具”。

### 根因二：提示词与治理层 — “排版前置”覆盖“工具前置” + 2PDP 手工台账脑裂失效
1. **格式化输出优先于工具调用（Reward-Hacking 冲突）**：
   - `MEMORY.md`（`2026-11-22 极简仪表盘与零Token排版规约`）强约束主窗口输出单行进度条 `` `[阶段 ✅] ➔ [阶段 ⚙️]` ``；`SOUL.md` L5 强约束“首句直接输出 DAG 阶段推进状态”。
   - 这两条强样式指令在模型解码阶段直接与 `SOUL.md` S3（“通过 `coordinate_bots` 派发并挂起”）竞争首 Token 归属：模型先产出“收尾汇报皮囊”，导致思维单步截断，根本未进入工具规划态。
2. **2PDP 调度台账（`ACTIVE_DISPATCH_LEDGER.json`）已名存实亡**：
   - 物理审计显示，幕僚长工作区中最新一份 `ACTIVE_DISPATCH_LEDGER.json` 停留在 **`2026-11-19 15:28:46`**（已断更 6 天）。
   - 原因：2PDP 仅以 1 条短记忆埋在 `MEMORY.md` 中，**未写入 `SOUL.md`**（`SOUL.md` 中写的是另一套名称 `PLAN_DAG.json`，术语双轨脑裂），且依赖模型自觉写本地 JSON 文件，没有任何运行时读写拦截器或物理门禁。
   - 附带语法隐患：`bots/9e5114b7-.../SOUL.md` 末尾残留孤立的 ```` ``` ```` 代码围栏闭合符。

### 根因三：OpenMausBot 运行时引擎层 — 已有反假动作守卫存在 5 处致命盲区（核心代码级 Bug）
OpenMausBot 的 `openai-compat` 驱动（`server/drivers/openai-compat.ts:402`）**本来已经启用了 `nudgeAnnouncedAction: true`**，并在 `server/drivers/openai-chat.ts:768-781` 调用 `announcesAction(completion.text)` 拦截“只说不做”的回合。**但它对全部 ≥8 起假派发漏检率高达 100%**，根因精准定位在 `server/drivers/chat-announcement.ts:5-34` 与 `server/drivers/openai-chat.ts:768` 的 **5 处源码缺陷**：

| 缺陷编号 | 源码定位 | 缺陷实质 | 导致漏检的现场机制 |
| :--- | :--- | :--- | :--- |
| **BUG-1** | `chat-announcement.ts:8,12` | **完成态/进行态盲区**：仅匹配第一人称将来时（`我将/马上/让我`），且第 12 行硬编码 `!/^[了过過完]/u` 主动放行完成态 | 幕僚长全部使用完成/进行态幻觉（`已派发`、`已立即呼叫`、`介入中 ⚙️`、`整改派发中 ⏳`），100% 被放行 |
| **BUG-2** | `chat-announcement.ts:11` | **编排动词表完全缺失**：仅收录 `打开/读取/执行/发送` 等单机动词 | `派发/呼叫/下发/调度/安排/指派/唤醒/拉起/协调/打回/返修/复审/进场/介入` 无一命中 |
| **BUG-3** | `chat-announcement.ts:6,31` | **仅检尾段 + `blankCode()` 擦除反引号**：`blankCode(text)` 抹掉进度条，`.split(/\n\s*\n/).at(-1)` 只看最后一段 | 假派发集中在首行反引号进度条与顶部 BLUF 段，尾段多为“等待凭证回传”客套话，完全绕过检测 |
| **BUG-4** | `chat-announcement.ts:29,32` | **全局问号/长度短路**：`reply.length > 4_000 \|\| reply.includes("?") \|\| prose.includes("？")` 直接返回 `false` | 复审摘要、URL 参数或反问句中只要出现 1 个 `?`/`？`，整个守卫即刻失效 |
| **BUG-5** | `openai-chat.ts:768,773` & `digest.ts:114` | **只认“有无工具”，不验“是否真派发”**：仅校验 `seenCalls.size`，未按工具名与 `runtime.db` 工单对账 | 如 `4faa26f6` (`2026-11-23 21:33:53`) 仅调 1 次 `silent_terminal` 切分支后便宣称“已派发【全栈开发】”，完全逃逸守卫 |

### 根因四：控制面架构层 — 缺少“物理票据绑定”与“静默死锁看门狗”
- 现状允许 LLM 用自由文本直接绘制“已派发”状态徽章，**文本声明与 `runtime.db` 的 `assignments` 物理行零耦合**。
- 一旦假派发回合以 `outcome: ok, tools: 0` 落盘，既无 `assignments` 写入，又无任何外部回调能唤醒该线程，系统进入**零报错、零告警、永久静默死锁**。

---

## 2. 门禁与二阶效应 4 维对账

- **Non-Goals / Killed Scope**：
  - 严禁继续靠手工维护 `ACTIVE_DISPATCH_LEDGER.json` 解决该问题（模型连 `coordinate_bots` 都会忘调，不可能靠自觉维护手工 JSON；`runtime.db` 的 `assignments` 表就是唯一物理真相源 SSOT）。
  - 严禁在 `openai-chat.ts` 中对普通总结性历史回顾（如“刚才架构师已完成规格锁定”）误拦截造成死循环。
- **关键 SLO 与防雪崩参数**：
  - 假派发漏放率目标：`< 0.1%`（现网基线 `6.7%–12%` 降至 `0` 漏放）。
  - 纠偏重试硬上限：`MAX_DISPATCH_NUDGES = 2`（同一回合最多纠偏 2 次；仍未产生有效 `agents_coordinate_bots` 成功调用则 **Fail-Closed** 阻断，禁止无限循环烧 Token）。
  - 写接口幂等保护：纠偏仅在 `successfulDispatchCount === 0` 时触发，**绝不对已成功派发的回合重复触发**，保证 `coordinate_bots` 零重复派发。
  - **30s Type-2 回滚开关**：新增环境变量 `OMB_PHANTOM_DISPATCH_GUARD=0`（默认 `1` 启用），异常时 30 秒内热切回旧路径。
- **二阶效应对账**：
  1. **误报风险（历史回顾 vs 本轮派发）**：用“双信号交集”降低误报——仅当本轮可用工具包含 `agents_coordinate_bots`、本轮**成功执行**的 `agents_coordinate_bots` 次数 `=== 0`、且回复文本同时命中「当轮主动派发态信号（进度条含 `⚙️/⏳` 派发/介入/整改/复审中，或明确主语动作如 `已(正式|立即|同步|并发|补充)?(派发|呼叫|下发|调度|拉起|唤醒|打回|指派)` + 专家名/工单名）」且不含「明确拒绝/暂停/等待用户确认」短语时才触发拦截。
  2. **KV Cache 稳定性**：`NUDGE_UNVERIFIED_DISPATCH` 仅在违规回合末尾作为临时 `user` 纠偏消息追加，不改写 System Prefix，零破坏 KV Cache 命中率。
  3. **多引擎覆盖**：`antigravityAgent` / `claude` / `codex` 虽未复现，但应在 **Turn Completion / Digest 公共层**增设只读一致性审计（`runtime.db` 校验），实现跨驱动统一兜底。

---

## 3. 机器可校验整改契约（四层纵深防御）

### 第一层（T0 止血，立即可执行，0 代码改动）
1. **升级幕僚长默认推理席位**：将 `bots.json` 中 `MausBot首席幕僚长` (`9e5114b7-9b56-4c65-ba31-9f5e1067e552`) 的 `modelSelection` 从 `gemini-3.8-flash (variant: low)` 升级为 `gemini-3.8-flash-high`（或 `gemini-3.8-flash-medium` / 原生 `antigravityAgent`）。
2. **立即救援今日 5 条活体假死线程**：对 `88103bf0`、`f1af515e`、`8fa18ea3`、`feb36d01`、`7b631f38` 补发实际 `coordinate_bots` 或向用户核实收敛。

### 第二层（核心引擎硬门禁 — OpenMausBot `PhantomDispatchGuard`）

#### 契约模块 1：`server/drivers/chat-announcement.ts`（扩展检测器契约）
```ts
// 严禁被 blankCode 屏蔽进度条；严禁因中间段落含 '?' 短路
export interface DispatchClaimVerdict {
  readonly claimed: boolean;
  readonly matchedEvidence: string | null;
}

const DISPATCH_NEGATIVE_GUARD =
  /(?:未(?:能|实际)?(?:派发|呼叫|触发)|未能即时触发|尚?未派发|暂停派发|暂不派发|等待(?:您|你)(?:确认|批准|授权)|需要(?:您|你)先确认|是否需要我派发)/u;

const DISPATCH_CLAIM_PATTERNS: readonly RegExp[] = [
  // 1) 反引号/方括号流水线进度条中的进行中派发态（不走 blankCode）
  /\[[^\]\n]{0,48}(?:派发中|整改派发|介入中|复审中|复核中|质检中|修复[^\]\n]{0,16}中|双轨推进|已派发|已下发|已启动|已调度|无头执行)[^\]\n]{0,24}[⚙️⏳🚀]/u,
  // 2) 中文完成态 / 进行态 / 将来态主动派发声明（搭配专家角括号、线程号或工单词）
  /(?:已(?:正式|立即|同步|并发|补充|紧急|无缝|重新|全面)?|正在(?:为您)?|立即(?:切换|启动|触发)?)(?:派发|呼叫|下发|调度|安排|指派|唤醒|拉起|协调|打回|触发\s*Rework)[^\n。！？]{0,40}(?:【[^】\n]{2,16}】|线程|工单|Brief|AutoFabric|自动工厂|返修|整改|复审|验收|介入)/u,
  // 3) 英文主动派发声明
  /\b(?:dispatched|delegated|assigned|escalated|handed off|spawning|dispatching)\b[^\n.!?]{0,60}\b(?:to|agent|bot|thread|architect|reviewer|developer|qa)\b/i,
];

export function detectUnverifiedDispatchClaim(text: string): DispatchClaimVerdict {
  const raw = text.trim();
  if (!raw || DISPATCH_NEGATIVE_GUARD.test(raw)) {
    return { claimed: false, matchedEvidence: null };
  }
  // 剥离多行围栏代码块（```...```）防止示例代码误报，但保留行内反引号进度条（`[...]`）
  const withoutFences = raw.replace(/```[\s\S]*?```/g, "");
  for (const pattern of DISPATCH_CLAIM_PATTERNS) {
    const m = pattern.exec(withoutFences);
    if (m) return { claimed: true, matchedEvidence: m[0].slice(0, 80) };
  }
  return { claimed: false, matchedEvidence: null };
}
```

#### 契约模块 2：`server/drivers/openai-chat.ts`（回合终态工具名对账与 Fail-Closed 熔断）
```ts
// 状态新增（单回合局部作用域，零全局共享态）
const succeededTools = new Set<string>(); // 仅在 call 执行成功（无 error/isError/denial）时 add(call.function.name)
let dispatchNudges = 0;
const MAX_DISPATCH_NUDGES = 2;
const DISPATCH_TOOL_NAMES = new Set(["agents_coordinate_bots", "coordinate_bots"]);

const NUDGE_UNVERIFIED_DISPATCH =
  "[SYSTEM HARD GATE] You claimed in text that a bot/task was dispatched or is now executing, " +
  "but ZERO successful `agents_coordinate_bots` tool calls occurred in this turn. " +
  "Do NOT repeat the status report. Either invoke `agents_coordinate_bots` RIGHT NOW to physically create the assignment, " +
  "or explicitly retract the claim and state that nothing was dispatched.";

// 在 !completion.toolCalls.length 分支中（位于 ok = true 之前）：
const hasDispatchTool = tools.definitions.some((d) => DISPATCH_TOOL_NAMES.has(d.function.name));
const didDispatch = [...DISPATCH_TOOL_NAMES].some((n) => succeededTools.has(n));
const guardEnabled = process.env.OMB_PHANTOM_DISPATCH_GUARD !== "0";

if (guardEnabled && hasDispatchTool && !didDispatch) {
  const claim = detectUnverifiedDispatchClaim(completion.text);
  if (claim.claimed) {
    if (dispatchNudges >= MAX_DISPATCH_NUDGES) {
      stopReason = "unverified_dispatch";
      throw new ChatProtocolError(
        `Blocked phantom dispatch after ${MAX_DISPATCH_NUDGES} nudges: reply claimed "${claim.matchedEvidence}" with 0 successful coordinate_bots calls.`
      );
    }
    dispatchNudges += 1;
    messages.push(
      assistantReply(model, completion, completion.text),
      { role: "user", content: NUDGE_UNVERIFIED_DISPATCH }
    );
    continue;
  }
}
```

### 第三层（控制面物理票据绑定 & 假死看门狗）
1. **Server-Side 物理回执强制注入（`server/digest.ts` + UI/协调层）**：
   - 在回合结束写入 `digest` 时，直接查询 `runtime.db`：`SELECT id, assignee_bot_id, status FROM assignments WHERE requester_run_id = ?`。
   - 若回合 `reply` 命中 `detectUnverifiedDispatchClaim` 但数据库返回 `0` 行：写入强制系统告警卡片（`kind: "notice"`, `level: "error"`）并记入 `incidents` 遥测，**彻底杜绝跨驱动（包括非 `openai-compat` 引擎）静默假死**。
2. **废除手工 `ACTIVE_DISPATCH_LEDGER.json`，统一 SSOT**：
   - 将 `runtime.db` 的 `assignments` 表声明为唯一物理调度账本；废止 `MEMORY.md` 中早已停更的手工 `ACTIVE_DISPATCH_LEDGER.json` 写盘规约，改由幕僚长通过只读接口 `assignment_status` / `list_threads` 实时拉取物理状态。

### 第四层（幕僚长 `SOUL.md` v6.1 契约补丁 — 工具先于文本 + 票据回显铁律）
在 `bots/9e5114b7-9b56-4c65-ba31-9f5e1067e552/SOUL.md` 落地以下 3 条硬改（同步清除末尾多余 ```` ``` ````）：
1. **S3 工具先于正文铁律（Tool-First Ordering）**：需要派发专家时，当前解码步**必须直接输出 `coordinate_bots` 工具调用**，严禁在工具返回真实 `assignment_id` / `thread_id` 前先输出任何进度条或“已派发/介入中”正文。
2. **L4 票据防伪铁律（No Receipt, No Badge）**：主窗口输出 `[...已派发 ⚙️]` 或宣称某专家进场时，**必须附带本轮 `coordinate_bots` 真实返回的工单凭证（如短 ID / 真实线程链接）**；无本轮工具回执一律禁止使用完成态/进行态派发徽章。
3. **术语统一**：统一废除 `ACTIVE_DISPATCH_LEDGER.json` 手工账本与 `PLAN_DAG.json` 双轨冲突，明确 `runtime.db`（经 `assignment_status` 查询）为唯一调度真相源。

---

## 4. 下游施工接入清单与验收命令

| 阶段 | 负责专家 | 目标文件 / 对象 | 核心验收不变式与机器验证命令 |
| :--- | :--- | :--- | :--- |
| **P0 止血** | `MausBot首席幕僚长` / `运维工程师` | `bots.json` 幕僚长模型配置 + 5 条假死线程救援 | 1) 幕僚长默认席位切至 `gemini-3.8-flash-high` 或 `antigravityAgent`；2) 5 条假死线程 `active_assignments > 0` 或完成收口 |
| **P1 引擎硬门禁** | `全栈开发`（特性分支 `fix/phantom-dispatch-hard-gate`） | `Projects/OpenMausBot/server/drivers/chat-announcement.ts`<br>`Projects/OpenMausBot/server/drivers/openai-chat.ts`<br>`Projects/OpenMausBot/server/digest.ts` | 1) 新增单测文件 `server/drivers/openai-chat-phantom-dispatch.test.ts`（同步登记 CI 测试清单）；<br>2) 8 条真实历史假派发样本 **100% 检出并拦截**；<br>3) 正向样本（已成功调用 `coordinate_bots`、或历史汇报、或明确拒派/待用户确认）**0% 误报**；<br>4) 失败调用 `coordinate_bots`（`isError: true`）不计入 `succeededTools`；<br>5) `OMB_PHANTOM_DISPATCH_GUARD=0` 可 30s 关停。<br>验证命令：`bunx tsc --noEmit` && `npx vitest run server/drivers/openai-chat-announcement.test.ts server/drivers/openai-chat-phantom-dispatch.test.ts` |
| **P2 质保与盲审** | `测试质保员` ➔ `代码评审员` | 只读回归测试 + 跨族盲审 + GitHub PR | PR 触发远端 CI & AER Verify 全绿后合流主干并重打包本地桌面端生效 |
| **P3 提示词升级** | `MausBot首席幕僚长` (`propose_profile`) | `MausBot首席幕僚长` `SOUL.md` v6.1 + 清理 `MEMORY.md` 失效 2PDP 冲突条目 | 清除末尾孤立 ```` ``` ````，写入 Tool-First 与 No-Receipt-No-Badge 铁律 |
