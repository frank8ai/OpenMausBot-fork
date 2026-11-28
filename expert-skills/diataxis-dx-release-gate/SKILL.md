---
name: diataxis-dx-release-gate
description: "面向文档与版本发布员 (Docs & Release Notes) 的硅谷顶级文档工程技能：贯彻 Daniele Procida Diataxis 4 象限架构与 Stripe 极致 DX 哲学，落地 Docs-as-Code、OpenAPI 契约漂移双向对账、Keep a Changelog 与 SemVer 语义发布门禁。"
---

# Diataxis DX & Contract Release Gate Engine (Diataxis 文档架构与契约发布技能)

## 1. 核心定位与设计哲学 (Core Mission & Tenets)

本技能专为**文档与版本发布员 (Docs & Release Notes)** 打造，深度对齐 Daniele Procida Diataxis 国际文档架构体系与 Stripe 开发者体验 (Developer Experience, DX) 极致哲学。坚决杜绝“教程与手册混乱混杂”、“代码演进后文档过时产生契约漂移”以及“暗中夹带破坏性变更 (Breaking Changes)”三大发布反模式。

### 核心铁律 (The 4 Inviolable Docs Laws)
1. **Docs-as-Code Invariant (代码与文档同 PR 共生)**:
   - 严禁代码变更与文档发布割裂。任何接口契约、配置参数或行为逻辑的修改，必须在同一个 PR 中同步更新对应文档。
2. **Diataxis Single-Mode Purity (Diataxis 单一职责纯度)**:
   - 严禁在同一份文档中混杂教程与参考手册。Tutorials、How-To、Reference、Explanation 四象限必须保持物理单态。
3. **Contract Drift Zero-Tolerance (契约漂移一票否决)**:
   - 外部文档中的参数名、字段类型、请求响应示例必须与机器可读的 OpenAPI 3.1 / JSON Schema 保持 100% 对齐。自动化 Diff 出现未声明差异即刻阻断发布。
4. **SemVer 2.0 & Keep a Changelog Strict Compliance (语义化版本与变更日志纪律)**:
   - 严格遵从 SemVer 2.0 规则（MAJOR.MINOR.PATCH）。严禁在 PATCH/MINOR 版本中引入未经标注的破坏性变更；Changelog 必须包含严格 6 大分类。

---

## 2. Diataxis 4 象限矩阵架构

| 象限分类 | 核心导向 | 目标读者 | 编写法则 | 严禁事项 |
|---|---|---|---|---|
| **Tutorials** | **学习导向** (Learning-oriented) | 初学者 / 新手接入 | 带领用户完成“第一个成功案例”，步步紧扣 | 严禁解释深层抽象理论与底层原理 |
| **How-To Guides** | **目标导向** (Goal-oriented) | 生产工程师解决具体问题 | 聚焦具体任务场景，高效给出解决步骤与代码 | 严禁从头讲解基础安装，直接切入核心操作 |
| **Reference** | **信息导向** (Information-oriented) | 日常开发速查契约 | 机器级精确、详尽列出参数、类型、默认值与字典 | 严禁夹杂故事叙述与操作指引 |
| **Explanation** | **理解导向** (Understanding-oriented) | 架构师与系统维护者 | 深入阐述架构演进背景、权衡考量与二阶思维 | 严禁罗列操作指令或接口参数表 |

---

## 3. 标准发布审计门禁 (Release Gate SOP)

1. **S1 [OpenAPI 契约 Diff 对账]**：运行 `openapi_diff_gate.py` 对比前后版本，检测 Breaking Changes。
2. **S2 [死链与代码示例静态检验]**：确保所有相对链接与代码片段在 CI 沙盒中执行通过。
3. **S3 [Changelog 6 分类倒序归档]**：结构化记录 Added, Changed, Deprecated, Removed, Fixed, Security。
4. **S4 [SemVer 标签签发与通知]**：出具版本发布说明（Release Notes）并推送全团队通知。
