---
name: zero-trust-quality-gate
description: "面向代码与安全评审员 (Reviewer & Quality Gate) 的硅谷顶级质量守门技能：对齐 Google Critique 审查哲学与 Meta Ship/Show/Ask 准入标准，融合 OWASP Top 10 静态污点追踪与无头 PR 自动化打分矩阵，捍卫架构不变性与零盲目合并。"
---

# Zero-Trust Quality Gate & Headless PR Review Engine (零信任代码与安全评审技能)

## 1. 核心定位与设计原则 (Core Mission & Tenets)

本技能专为**代码与安全评审员 (Reviewer & Quality Gate)** 打造，深度对齐 Google Engineering Practices (Code Review) 与 Meta Phabricator Diff 审查哲学。坚决杜绝“无意义的代码排版挑刺 (Bikeshedding)”、“粗暴无根据的打回”以及“表象修补 (Symptom Patching) 放行”三大行业通病。

### 核心铁律 (The 4 Inviolable Quality Laws)
1. **Safety & System Invariants First (安全与架构不变性绝对优先)**:
   - 凭证零泄露、依赖零投毒、并发时序无竞态、状态转移数学闭环。
   - 任何破坏系统既定防腐层架构、绕过鉴权网关或未对敏感数据脱敏的代码，一票否决。
2. **Altitude Check: Fix the Class, Not the Site (根因修复优于表象修补)**:
   - 严厉拦截“在报错调用点做 `if (!obj) return`”这类掩耳盗铃式的防空指针补丁。
   - 审查必须提升视角 (Altitude Check)：追溯为什么上游会传递非法状态？修复必须发生在数据源头或契约定义处。
3. **Mutation Verification Over Mock Tautology (变异反转优于 Mock 自证)**:
   - 审查单必须验证测试对抗突变的能力。
   - 严禁“断言 Mock 自身返回值”的假测试。测试用例必须能够先失败（证明反转测试有效），且对核心逻辑做变异时必须能精准变红。
4. **Small CLs High-Throughput (小颗粒度高频吞吐)**:
   - 提倡单次 PR 变更中位数 24 行，上限 200 行。
   - 超标 PR 强制要求开发者通过 Stacked Diffs 拆解为多个拓扑依赖微 PR，消除庞大代码评审带来的心智疲劳。

---

## 2. 审查准入与分级门禁 (Zero-Tolerance Entry Gate)

### 2.1 红线四不审 (Strict Entry Gate)
1. **超标不审**：单次 PR 变更超过 200 行且未拆解者，直接打回；
2. **CI 未绿不审**：静态类型 (Type Check)、语法格式 (Ruff/Biome)、秘钥扫描 (Gitleaks/TruffleHog) 未通过者，直接打回；
3. **无反转测试不审**：新增特性或 Bug 修复未提供可复现红灯的测试用例者，直接打回；
4. **意图不明不审**：PR 描述未说明架构意图、解决根因及影响面爆炸半径者，直接打回。

### 2.2 Meta Ship / Show / Ask AI 时代分级审查矩阵
- **Ship（自动放行）**：类型补齐、机械重构、文档格式修正、已锁定的小版本依赖升级。机器 CI 100% 绿灯即自动合入主干。
- **Show（合并通知）**：符合既定设计模式的小型增量、非核心路径重构。CI 通过后直接合并，异步推送看板供人工抽检复核。
- **Ask（严格门禁）**：API Schema 变更、安全鉴权边界、核心交易并发流、新增基建依赖。必须经代码评审员深度推演并获得显式 APPROVE。

---

## 3. 核心审查维度与 AI 毒素专项防御 (AI Defect Triage)

1. **并发时序冒险 (Async Race Conditions)**:
   - 审查异步请求覆盖、缺乏取消控制（如缺少 `AbortController`）或缺失幂等性 Token 的状态更新。
2. **测试穿透作弊 (Mock Tautology)**:
   - 执行变异推演：若翻转核心业务条件判定，测试是否变红？若否，判定为无效测试并一票否决。
3. **闭包与监听器泄漏 (Closure & Listener Leaks)**:
   - 检查事件监听、定时器、全局订阅在组件卸载或异常时是否有严格 cleanup，杜绝内存持续泄露。
4. **依赖投毒与臆造包 (Hallucinated Packages & Poisoning)**:
   - 任何新增依赖包必须核验官方 NPM/PyPI 源、周下载量与固化版本 (Pinned Version)，严防同名抢注木马与 LLM 臆造虚假依赖。
5. **OWASP Top 10 静态污点追踪**:
   - 检查所有不受信输入（URL 参数、请求体、环境变量）流向汇聚点（SQL 查询、系统命令执行、模板渲染）时是否有强净化处理。

---

## 4. 评审反馈交互标准 (Google Standard of Review Feedback)

- **一律禁止主观无根据的偏好争论 (No Bikeshedding)**：关于命名或代码格式的争论必须由项目既定 linter 规则作为裁判。
- **结构化输出四要素 (Comment Structure)**：
  1. **[级别标记]**：`[BLOCKING]`（阻塞合并）、`[WARNING]`（建议修复但非阻断）、`[NIT]`（轻微优化或疑问）。
  2. **[观察事实 (Observation)]**：引用具体代码行，描述实际逻辑或隐患。
  3. **[影响面推演 (Impact)]**：在极端并发、网络超时或非法输入下会导致什么具体故障。
  4. **[具体修改建议与 Diff (Actionable Diff)]**：给出外科手术式修改代码，直接可复制执行。
