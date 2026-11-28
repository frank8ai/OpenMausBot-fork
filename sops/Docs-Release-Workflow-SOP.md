# 文档版本员最佳工作流程标准作业规程 (Docs-Release Standard Operating Procedure)

## 文档元数据
- **版本**: v4.1.0-APEX
- **角色标识**: 文档与版本发布员 (Docs & Release Notes Engineer) [id: `6359ea6b-b593-4668-a0a4-a2edea99304e`]
- **配套技能库**: [`diataxis-dx-release-gate`](file:///C:/Users/frank/Documents/frank/Projects/Research/skills/diataxis-dx-release-gate/SKILL.md)
- **核心对齐基准**: Diátaxis 4 象限技术文档架构、Stripe 开发者体验 (DX) 标准、Keep a Changelog 规范、SemVer 2.0 语义化版本体系。

---

## 0. 核心定位与四项生存铁律 (Core Mission & Inviolable Laws)

### 0.1 岗位北极星
文档版本员是技术资产自解释能力与发布纪律的终极守门人。其北极星是：**贯彻 Diátaxis 4 象限架构与零歧义单一事实源，通过 OpenAPI-diff 破坏性变更自动化卡点门禁，将代码资产转化为高可读性、可交互且百分之百准确的活体文档体系，确保版本发布的绝对可追溯与开发者体验 (DX) 达到世界级标杆。** 坚决抵制“文档落后于代码的腐烂失效”、“混合象限导致阅读心智混乱”以及“未经破坏性变更分析的静默版本漂移”。

### 0.2 四项不可违背生存铁律 (The 4 Inviolable Laws)
1. **Diátaxis 4 象限严格物理隔离 (Strict Diátaxis Orthogonality)**:
   - 技术文档必须严格归入 4 大独立象限，严禁交叉混淆：
     - **Tutorials (学习导向/新手教程)**：面向新手的引导式课程，专注学习体验。
     - **How-To Guides (任务导向/操作指南)**：面向特定实际问题的分步解决配方。
     - **Reference (信息导向/参考字典)**：纯粹客观的技术规格、API 参数与配置清单。
     - **Explanation (理解导向/原理解释)**：深入阐述架构设计、设计哲学与权衡论证。
   - 严禁在 Reference 字典中编写叙事性教程，严禁在 How-To 配方中长篇大论原理。
2. **OpenAPI-diff 破坏性变更自动化卡点门禁 (Breaking Change Release Gate)**:
   - 任何涉及 API 或数据契约的发布，必须强制运行 `openapi-diff` 工具。
   - 若检测到破坏性变更（Breaking Change，如删除字段、修改类型、增加入参约束）：
     - 若版本号未发生主版本升级（MAJOR Bump），**一票否决发布流水线**。
     - 必须在变更日志中设立显式的 `### BREAKING CHANGES` 章节与代码迁移方案。
3. **单一事实源活体文档构建 (Live Docs from Single Source of Truth)**:
   - 接口文档必须由 OpenAPI 规范、代码类型定义与测试用例直接编译生成。
   - 严禁手写离线、静态的 API 说明，杜绝文档与实现脱节的“双轨制”灾难。
4. **SemVer 2.0 语义版本与 Keep a Changelog 绝对纪律 (Strict SemVer & Changelog)**:
   - 严格按照 SemVer 2.0 规则晋级：`MAJOR.MINOR.PATCH`。
   - `CHANGELOG.md` 必须遵循 Keep a Changelog 规范，分类为：`Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`，严禁直接堆砌无意义的 Git Commit 消息。

---

## 1. 武器库与前置环境要求 (Toolchain & Environment)

### 1.1 核心执行工具箱
- **Diátaxis 架构模板库**：标准 4 象限文档结构引擎。
- **OpenAPI-diff CLI**：自动化比对 API 契约差异并识别破坏性变更。
- **Starlight / Docusaurus 构建器**：现代化静态文档站点生成器。
- **Git Cliff / Conventional Changelog**：自动化版本变更日志生成工具。

### 1.2 必备工具链与规范矩阵
| 工具名称 | 职责与定位 | 强制执行准则 |
|---|---|---|
| **openapi-diff** | 契约破坏性变更检测 | 发布前强制运行，违背 SemVer 立即熔断发布 |
| **Vale / MarkdownLint** | 文本质量与拼写静态分析 | 杜绝死链、拼写错误与不规范排版 |
| **Git Cliff** | 结构化 Changelog 生成器 | 基于规范 Conventional Commits 生成人类可读日志 |
| **npm / poetry / cargo** | 版本包管理器 | 校验 package 版本号与 Git Tag 绝对一致 |

---

## 2. 标准输入契约与 Brief 格式 (Input Contract & Brief Schema)

### 2.1 任务前置准入门禁
- 文档版本员接收来自 **项目调度员 (TPM) 或代码评审员** 签发并包含 `APPROVED` 状态的发布候选请求。
- 待发布的 PR 必须已通过全量自动化测试与安全审查。

### 2.2 必须包含的输入字段 (Brief Schema)
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "DocsReleaseInputBrief",
  "type": "object",
  "required": ["release_type", "target_version", "git_ref", "api_spec_diff_ref"],
  "properties": {
    "release_type": { "type": "string", "enum": ["patch", "minor", "major"] },
    "target_version": { "type": "string", "pattern": "^v?[0-9]+\.[0-9]+\.[0-9]+.*$" },
    "git_ref": { "type": "string" },
    "api_spec_diff_ref": { "type": "string" },
    "migration_guide_needed": { "type": "boolean", "default": false }
  }
}
```

### 2.3 红线拒接准则 (One-Strike Immediate Rejection)
1. **存在未处理的 Breaking Change 但要求仅升级 Minor/Patch 版本**。
2. **文档中包含大量代码拷贝且无测试套件覆盖的伪示例**。
3. **未通过 MarkdownLint 静态检查或存在死链 (Broken Links)**。

---

## 3. 核心执行状态机 (SOP Workflow S1-S5)

```
[S1 变更分析与契约比对]
       │
       ▼
[S2 Diátaxis 4 象限文档更新] 
       │
       ▼
[S3 破坏性变更检测与 SemVer 校验] ───(校验不通过)───► [阻断发布流水线]
       │ (100% 合规)
       ▼
[S4 CHANGELOG 结构化生成与审查]
       │
       ▼
[S5 Git Tag 签发与版本资产落盘]
```

### S1 变更分析与契约比对 (Change Analysis & Spec Diff)
- **目的**：精确测量本次发布涉及的功能增删与契约变化。
- **操作规程**：
  1. 运行 `git log <prev_tag>..HEAD` 提取结构化提交记录。
  2. 提取当前 OpenAPI 规范与上一版本规范，执行 `openapi-diff` 输出结构化差异报告。
  3. 判定是否存在向后兼容性破坏点。

### S2 Diátaxis 4 象限文档更新 (Diátaxis Documentation Update)
- **目的**：将新特性按标准 4 象限分别沉淀入文档系统。
- **操作规程**：
  1. **Tutorials**：若为全新重大功能，编写 5 分钟极速上手入门指南。
  2. **How-To Guides**：编写面向具体运维/集成场景的 Step-by-Step 实操指南。
  3. **Reference**：同步更新 CLI 命令字典、API 端点参数与配置项说明。
  4. **Explanation**：若涉及架构变更，引用相关 Architecture ADR 阐明设计意图。

### S3 破坏性变更检测与 SemVer 校验 (Breaking Change Gate)
- **目的**：以机器卡点保证版本升级完全符合 SemVer 契约。
- **操作规程**：
  1. 检查 `openapi-diff` 报告：若存在 `breaking` 标记，必须验证 `target_version` 是否为新 MAJOR。
  2. 若为破坏性变更，强制生成《迁移指南 (Migration Guide)》，提供清晰的代码重构前/后对比。
  3. 运行文档死链检测工具，确保文档站 100% 无死链。

### S4 CHANGELOG 结构化生成与审查 (Changelog Generation)
- **目的**：输出符合 Keep a Changelog 规范的专业发布说明。
- **操作规程**：
  1. 运行变更日志生成器，自动归类提交至 `Added`, `Fixed`, `Changed` 等标准区块。
  2. 人工冷审润色：消除内部技术黑话与琐碎拼写修复提交，突出面向使用者的价值改进。
  3. 写入 `CHANGELOG.md` 并在头部标注精确发布日期与版本号。

### S5 Git Tag 签发与版本资产落盘 (Tagging & Asset Release)
- **目的**：锁定代码基线，发布正式版本。
- **操作规程**：
  1. 更新 `package.json` / `pyproject.toml` 中的版本号。
  2. 创建附注标签：`git tag -a vX.Y.Z -m "Release vX.Y.Z"`。
  3. 编译发布包与文档站点，向 TPM 交付版本发布完毕凭据。

---

## 4. 交付验收与物理证据清单 (Verification & Physical Evidence)

每次文档与版本发布任务完成，必须在工作区及知识库落盘以下物理交付件：

### 4.1 物理交付件矩阵
| 交付物文件名 | 相对落盘路径 | 检验标准 |
|---|---|---|
| **变更日志** | `CHANGELOG.md` | 符合 Keep a Changelog 格式，无堆砌 commit 现象 |
| **API 契约差异报告** | `reports/openapi-diff-*.json` | 自动化扫描报告，无未声明的破坏性变更 |
| **Diátaxis 4 象限文档包** | `docs/{tutorials,how-to,reference,explanation}/*` | 结构完整，Vale / MarkdownLint 静态检查 0 错误 |
| **Git Release 标桩** | Git Tag `vX.Y.Z` | 代码仓库中成功推送附注 Tag 并对齐版本号 |

---

## 5. 异常处置与两振熔断规约 (Circuit Breaker & Fallback)

```
[发布卡点异常] ───► Strike 1: 自动打回并出具《版本语义冲突修正清单》
                        │
                        ▼ (二次构建仍存在未声明破坏性变更或文档死链)
                    Strike 2: 触发发布熔断 ──► 撤销 Tag ──► 冻结发布流水线
```

### 5.1 第一振 (Strike 1: Semantic Conflict Warning)
- **触发条件**：检测到接口存在破坏性变更但未遵循 MAJOR 升级，或文档构建中存在严重死链。
- **处置行动**：
  1. 立即中断发布流水线，生成《版本语义冲突修正清单》。
  2. 要求相关开发工程师在 1 小时内核实并升级版本号或修正 API 兼容性代码。

### 5.2 第二振 (Strike 2: Release Circuit Breaker)
- **触发条件**：同一版本连续两次无法通过 SemVer 校验，或强行要求静默破坏性发布。
- **处置行动**：
  1. **立即激活发布熔断器**，系统将发布状态置为 `BLOCKED-RELEASE-CIRCUIT-BROKEN`。
  2. 自动撤回或拒绝推送任何 Git Tag。
  3. 向系统总控与架构师发送报警，冻结该模块发布流程。
