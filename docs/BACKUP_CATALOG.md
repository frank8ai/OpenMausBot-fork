# OpenMausBot 全团队配置与资产灾备库

本仓库为 **OpenMausBot (MausBot & 12位顶级智能体工程团队)** 的全量配置、提示词底座 (SOUL.md)、团队共享记忆 (Team Memory)、自动化例程 (Automations)、自研扩展补丁、全套自研垂直专家技能库及**标准化工作流程 SOP 全景矩阵**的独立私有灾备中心。

---

## 一、 灾备内容清单

```
openmausbot-backup/
├── README.md                          # 仓库说明与资产架构总账
├── RESTORE.md                         # 任意新机/灾后「100% 像素级一键高效恢复 SOP」
├── config/
│   ├── bots.json                      # 13位智能体全量配置、模型映射、工作目录与人设
│   ├── team-memory.json               # 团队共享持久化记忆、架构决策与封板 SOP
│   ├── routines.json                  # 定时与事件自动化 (Automations) 调度配置
│   ├── profile-learned.json           # 全局用户画像与最高设计准则
│   ├── config.sanitized.json          # 全局引擎驱动实例与 API 端点映射 (脱敏)
│   ├── mcp-servers.json               # 已配置并生效的 MCP 服务器清单
│   └── PLAN_DAG.json                  # 全团队多Bot协同编排调度已完成台账
├── souls/                             # 13位智能体独立 Markdown 人设与执行守则 (SOUL.md)
│   ├── 00-MausBot-总管.md
│   ├── 01-运维工程师.md
│   ├── 02-逆向分析师.md
│   ├── 03-产品战略师.md
│   ├── 04-技术与竞品情报官.md
│   ├── 05-测试质保员.md
│   ├── 06-体验设计师.md
│   ├── 07-项目调度员.md
│   ├── 08-文档版本员.md
│   ├── 09-代码评审员.md
│   ├── 10-全栈开发.md
│   ├── 11-软件架构师.md
│   └── 12-提示词架构师.md
├── sops/                              # 全团队 12 位垂直专家 + 协调中台标准化工作流程 (SOP) 全景矩阵
│   ├── Dev-Engineer-Workflow-SOP.md          # 01 全栈开发: AST语法树外科手术改写与TDD红绿隔离
│   ├── QA-Engineer-Workflow-SOP.md           # 02 测试质保员: Playwright纯无头确定性与Netflix混沌注入
│   ├── Code-Reviewer-Workflow-SOP.md         # 03 代码评审员: Google Critique审查哲学与零信任AST污点门禁
│   ├── DevOps-SRE-Workflow-SOP.md            # 04 运维工程师: Google SRE 14.4x燃烧率熔断与60s金丝雀回滚
│   ├── Product-Strategist-Workflow-SOP.md    # 05 产品战略师: CPSR栈式排序、JTBD机会算法与6大认知预算门禁
│   ├── Design-Engineer-Workflow-SOP.md       # 06 体验设计师: W3C DTCG 3层Token、Tailwind v4与9大UI状态防御
│   ├── Software-Architect-Workflow-SOP.md    # 07 软件架构师: 六边形防腐层架构、二阶思维推演与OpenAPI 3.1
│   ├── Meta-Prompt-Architect-Workflow-SOP.md # 08 提示词架构师: L0~L6分层元提示词、DSPy少样本与Promptfoo门禁
│   ├── Project-Manager-Workflow-SOP.md       # 09 项目调度员: Stripe/Linear DAG拓扑调度、两振死锁熔断与线程GC
│   ├── Docs-Release-Workflow-SOP.md          # 10 文档版本员: Diataxis 4象限架构、OpenAPI-diff破坏性门禁与SemVer
│   ├── REA-Engineer-Workflow-SOP.md          # 11 逆向分析师: NEC v. Intel净室重构协议、气隙沙箱与零版权污染
│   ├── Market-Intelligence-Workflow-SOP.md   # 12 技术情报官: Bloomberg/Gartner商业情报、三源交叉与痛点脱水
│   └── 多Bot协同任务拆解与自动推进执行规范(SOP).md # 00 协调总控: 多Bot四阶DAG拓扑编排与自治推进执行规范
├── extensions/                        # 自研 Antigravity 429 自动轮换与独占代理驱动源码及测试套件
│   ├── antigravity.ts                 # 主扩展驱动
│   ├── antigravity-switching.test.ts  # 账号轮换核心单元测试 (13 tests)
│   ├── antigravity-proxy.ts           # 独占 HTTP/HTTPS 代理与管道适配器
│   ├── antigravity-proxy.test.ts      # 独占代理转发测试 (5 tests)
│   ├── antigravity-credentials-watcher.ts # 凭证动态监视器
│   └── antigravity-credentials-watcher.test.ts # 凭证热重载测试 (5 tests)
├── expert-skills/                     # 全团队 12 套生产级自研垂直专家技能库
│   ├── 852bb4d4.../                   # 软件架构师: 六边形防腐层架构 (hexagonal-4giant-architecture)
│   ├── cb7fef6e.../                   # 提示词架构师: L0-L6元提示词流水线 (l0-l6-meta-prompt-forge)
│   ├── f2c0f000.../                   # 逆向分析师: 净室协议与契约还原 (rea-cleanroom-contract)
│   ├── 804819de.../                   # 技术与情报官: 全网痛点雷达 (social-media-painpoint-radar)
│   ├── surgical-tdd-isolation/        # 全栈开发: AST语法树外科手术改写与TDD隔离引擎
│   ├── deterministic-e2e-chaos/       # 测试质保员: Playwright确定性E2E与Netflix混沌注入
│   ├── zero-trust-quality-gate/       # 代码评审员: Google Critique哲学与OWASP静态污点审查
│   ├── sre-circuit-breaker-runbook/   # 运维工程师: Google SRE燃烧率熔断与K8s金丝雀回滚
│   ├── cognitive-budget-cpo/          # 产品战略师: CPSR栈式排序、JTBD算法与6大认知预算门禁
│   ├── dtcg-linear-design-system/     # 体验设计师: W3C DTCG Token契约与Linear级9态UI防御
│   ├── autonomous-dag-orchestrator/   # 项目调度员: 零打扰DAG编排、两振出局熔断与线程GC
│   └── diataxis-dx-release-gate/      # 文档版本员: Diataxis 4象限架构与OpenAPI漂移发布门禁
└── research/                          # 硅谷 Top 0.01% 及四大AI巨头顶级实践深度研报
    ├── SiliconValley-TopTier-Skills-Dev-QA-Report.md
    ├── SiliconValley-TopTier-Skills-Review-SRE-Report.md
    ├── SiliconValley-TopTier-Skills-Product-Design-Report.md
    └── SiliconValley-TopTier-Skills-TPM-Docs-Report.md
```

---

## 二、 核心团队成员与模型映射表

| 序号 | 智能体名称 | 职责定位 (Title) | 生产模型 (Model) | 默认工作区 (CWD) |
| :---: | :--- | :--- | :--- | :--- |
| **00** | **MausBot** | Chief of Staff & 个人总管 | `gemini-3.8-flash` | Private Workspace |
| **01** | **运维工程师** | 系统运维与可靠性工程师 (DevOps & SRE) | `deepseek-v4.1-flash` | `Projects` |
| **02** | **逆向分析师** | 自动化逆向与资产解构专家 (REA Engineer) | `deepseek-v4.1-flash` | `Documents\ChatGPT\rea` |
| **03** | **产品战略师** | 第一性原理产品战略官 (CPO) | `gemini-4-argon` | `Projects` |
| **04** | **技术与竞品情报官** | 技术与竞品情报官 (Market & Intelligence) | `gemini-3.8-flash` | `Projects` |
| **05** | **测试质保员** | 端到端测试与质量工程师 (Reliability & E2E) | `deepseek-v4.1-flash` | `Projects` |
| **06** | **体验设计师** | 前端体验与视觉设计专家 (Design Engineer) | `deepseek-v4.1-flash` | `Projects` |
| **07** | **项目调度员** | 技术项目经理与 DAG 调度器 (TPM) | `deepseek-v4.1-flash` | Private Workspace |
| **08** | **文档版本员** | 文档与版本发布员 (Docs & Release Notes) | `deepseek-v4.1-flash` | Private Workspace |
| **09** | **代码评审员** | 代码与安全评审员 (Quality Gate) | `deepseek-v4.1-flash` | Private Workspace |
| **10** | **全栈开发** | 全栈开发工程师 (Coder & Implementer) | `deepseek-v4.1-flash` | Private Workspace |
| **11** | **软件架构师** | 软件与系统架构师 (Spec-Writer & Architect) | `gemini-4-argon-high` | Private Workspace |
| **12** | **提示词架构师** | 元提示词架构师与 Bot 孵化系统 (Meta-Prompt) | `gemini-4-argon` | Private Workspace |

---

## 三、 全套 12 位专家自研技能库全景索引

| 角色 | 专属自研技能 | 核心前沿标杆实践 | 关键交付规范与模板 |
|---|---|---|---|
| **全栈开发** | `surgical-tdd-isolation` | Anthropic Claude Code, OpenAI Codex | AST-grep精确语法树改写、零挂起CLI流控、红绿TDD隔离 |
| **测试质保员** | `deterministic-e2e-chaos` | Microsoft Playwright, Netflix Chaos | 弱网/429/500/断网混沌注入、Trace全量复现包、Flaky自愈 |
| **代码评审员** | `zero-trust-quality-gate` | Google Critique, Meta Stacked Diff | 零信任污点追踪、Semgrep规则、Ship/Show/Ask三级门禁 |
| **运维工程师** | `sre-circuit-breaker-runbook` | Google SRE, Netflix Hystrix, Argo | 14.4x 燃烧率动态熔断、60s金丝雀自适应回滚、只读写隔离 |
| **产品战略师** | `cognitive-budget-cpo` | Shreyas Doshi CPSR, Tony Ulwick JTBD | 6大人类认知预算门禁 (CL-01~CL-06)、Amazon PR/FAQ、ADR |
| **体验设计师** | `dtcg-linear-design-system` | Linear, Apple, W3C DTCG, Tailwind v4 | OKLCH广色域Token、9大UI状态全防御、120~260ms微交互 |
| **项目调度员** | `autonomous-dag-orchestrator` | Stripe, Linear 异步拓扑编排 | “动词+对象+Done-When”结构化Issue、两振熔断、线程GC |
| **文档版本员** | `diataxis-dx-release-gate` | Daniele Procida Diataxis, Stripe Docs | 4象限架构、Keep a Changelog、OpenAPI契约双向Diff门禁 |
| **软件架构师** | `hexagonal-4giant-architecture` | 四大AI巨头原生SDK, 六边形端口架构 | 防腐层契约隔离、结构化输出、Prompt Caching原生集成 |
| **提示词架构师** | `l0-l6-meta-prompt-forge` | Anthropic / OpenAI 顶配元提示词工程 | L0~L6分层契约、Promptfoo冷审、防幻觉去偏矩阵 |
| **逆向分析师** | `rea-cleanroom-contract` | NEC v. Intel 净室重构标准 | 逆向提取与实现隔离、Cleanroom双工架构、API契约对齐 |
| **技术情报官** | `social-media-painpoint-radar` | 硅谷前沿情报雷达体系 | 真实痛点挖掘、开源车轮发掘、信噪比正交对比矩阵 |

---

## 四、 全团队 12 位垂直专家标准化工作流程 (SOP) 全景矩阵

全套 SOP 遵循 **“0. 核心定位与生存铁律”、“1. 武器库与前置环境要求”、“2. 标准输入契约 (Brief)”、“3. 核心执行状态机 (S1~S5)”、“4. 交付验收物理证据”与“5. 两振熔断与升级处置”** 六大工业级模块：

| 序号 | 角色名称 | 对应工作流程 SOP 文件 | 深度对齐行业标杆 | 核心执行机制与物理防御 |
| :---: | :--- | :--- | :--- | :--- |
| **01** | **全栈开发工程师** | [`Dev-Engineer-Workflow-SOP.md`](sops/Dev-Engineer-Workflow-SOP.md) | Anthropic Claude Code, OpenAI Codex CLI | 无红灯不出刀、AST 局部改写、`PAGER=cat` 零挂起 CLI、独立特性分支隔离 |
| **02** | **测试质保工程师** | [`QA-Engineer-Workflow-SOP.md`](sops/QA-Engineer-Workflow-SOP.md) | Microsoft Playwright, Netflix Chaos | 物理运行胜于口头保证、无障碍语义定位、Virtual Clock 秒级穿透、弱网/500混沌注入 |
| **03** | **代码与安全评审员** | [`Code-Reviewer-Workflow-SOP.md`](sops/Code-Reviewer-Workflow-SOP.md) | Google Critique, Meta Stacked Diffs | 代码健康度净改善、反表象修补、Ship/Show/Ask 三级分流、Semgrep AST 污点追踪 |
| **04** | **系统运维工程师** | [`DevOps-SRE-Workflow-SOP.md`](sops/DevOps-SRE-Workflow-SOP.md) | Google SRE, Argo Rollouts | 止血回退先于探因、只读/写凭证物理硬隔离、14.4x 燃烧率动态熔断、60s 金丝雀自适应回滚 |
| **05** | **第一性原理产品战略官** | [`Product-Strategist-Workflow-SOP.md`](sops/Product-Strategist-Workflow-SOP.md) | Shreyas Doshi CPSR, Tony Ulwick JTBD | 奥卡姆剃刀一票否决、JTBD 机会算法 ($O \ge 12$)、6 大人类认知门禁、Killed Scope ADR |
| **06** | **前端体验设计师** | [`Design-Engineer-Workflow-SOP.md`](sops/Design-Engineer-Workflow-SOP.md) | W3C DTCG, Tailwind CSS v4, Linear | DTCG 3 层 Token 架构、OKLCH 感知均匀色彩、9 大 UI 状态闭环防御、零布局偏移 ($CLS=0$) |
| **07** | **软件与系统架构师** | [`Software-Architect-Workflow-SOP.md`](sops/Software-Architect-Workflow-SOP.md) | Martin Fowler 六边形架构, OpenAPI 3.1 | 二阶思维因果链推演、四大 AI 巨头原生 SDK 六边形防腐层 (ACL)、单一事实源 SSOT |
| **08** | **元提示词架构师** | [`Meta-Prompt-Architect-Workflow-SOP.md`](sops/Meta-Prompt-Architect-Workflow-SOP.md) | Anthropic Meta-Prompt, DSPy, Promptfoo | L0~L6 分层元提示词契约、12 维客观冷审量规 ($\ge 90$ 分)、Promptfoo 自动化回归测试门禁 |
| **09** | **技术项目调度员** | [`Project-Manager-Workflow-SOP.md`](sops/Project-Manager-Workflow-SOP.md) | Stripe 异步文化, Linear DAG 调度 | 严格 DAG 拓扑锁定、“动词+宾语+Done-When”契约需求、两振死锁熔断器、线程/工作区 GC |
| **10** | **文档与版本发布员** | [`Docs-Release-Workflow-SOP.md`](sops/Docs-Release-Workflow-SOP.md) | Diataxis Framework, Stripe DX, SemVer 2.0 | Diataxis 4 象限物理隔离、OpenAPI-diff 破坏性变更卡点门禁、Keep a Changelog 绝对纪律 |
| **11** | **自动化逆向分析师** | [`REA-Engineer-Workflow-SOP.md`](sops/REA-Engineer-Workflow-SOP.md) | NEC v. Intel Cleanroom Protocol, NSA Ghidra | 脏室/净室物理硬隔离、静态 AST 反混淆与动态抓包双向核验、纯净室接口契约交付 (零版权污染) |
| **12** | **技术与竞品情报官** | [`Market-Intelligence-Workflow-SOP.md`](sops/Market-Intelligence-Workflow-SOP.md) | Bloomberg, Gartner, a16z Tech Due Diligence | 三源交叉客观核验铁律、去水军与虚荣指标脱水、Level-0~Level-3 车轮可用性评级、BLUF 结论先行 |
| **00** | **协调与编排总控** | [`多Bot协同任务拆解与自动推进执行规范(SOP).md`](sops/多Bot协同任务拆解与自动推进执行规范(SOP).md) | Chief of Staff & DAG Orchestrator | 四阶状态机自治推进、零多余打扰与弹窗、物理交付凭证核验、两振熔断与架构会诊机制 |
