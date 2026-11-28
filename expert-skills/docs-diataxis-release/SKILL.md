---
name: docs-diataxis-release
description: "全栈开发挂载的 Docs-as-Code 同 PR 文档共生、Diátaxis 四象限单态、OpenAPI 深度破坏性变更门禁与 Keep a Changelog 最新版本块校验规范。"
---

# Docs-as-Code, Diátaxis & Contract Release Gate (`docs-diataxis-release`)

## When to Use
- 在特性分支修改公开 API、CLI 参数、`requestBody` Schema 或枚举范围，在同一 PR 同步文档与 `CHANGELOG.md`。
- 版本发布（SemVer Bump）前调用 `evaluate_release` 校验 OpenAPI 破坏性变更与最新 Changelog 块合规性。

## Excluded When (DO NOT)
- **DO NOT** 在 `Reference` 手册中混入长篇教程，或在 `Tutorials` 中堆砌架构原理（严格保持 Diátaxis 单态纯度）。
- **DO NOT** 在非 `MAJOR` 发布中合入路由/方法/字段删除、新增必填参数、`requestBody` 内联改动、`type` 变更、`enum` 收窄或将无约束属性限制为 `enum`（`EXIT 1`）。
- **DO NOT** 在含破坏性变更的 `major` 发布中省略 `--changelog` 或仅凭历史旧版迁移说明放行（最新首个版本块必须含 `BREAKING CHANGES`，否则 `EXIT 2`）。
- **DO NOT** 向 `main` 直推文档或版本标签（必须走特性分支 PR + 远端 CI/AER 门禁）。

## 1. Diátaxis 四象限单态矩阵
| 象限 | 导向 | 读者 | 禁区 |
| :--- | :--- | :--- | :--- |
| **Tutorials** | 学习导向 | 新手首次跑通 | 禁讲底层架构权衡 |
| **How-To Guides** | 目标导向 | 工程师解决特定问题 | 禁从零教学安装 |
| **Reference** | 信息导向 | 开发速查契约 | 禁故事叙述与主观建议 |
| **Explanation** | 理解导向 | 架构师/维护者 | 禁罗列操作步骤或字段表 |

## 2. 同 PR 发布四步门禁 (S1–S4)
1. **S1 [单源对齐]**：从 OpenAPI / Zod / TypeSpec 同步文档，消除手写漂移。
2. **S2 [深度契约 Diff]**：检测路由、方法、参数、组件/`requestBody` 内联 Schema、字段类型、枚举值删减及**无约束到有限 enum 收窄**。
3. **S3 [最新块 Changelog 归档]**：按 Keep a Changelog 六分类更新；若含 Breaking Change，必须 `--bump major` 且最新首个 `## [x.y.z]` 版本块内包含 `BREAKING CHANGES` 迁移说明。
4. **S4 [示例与死链验证]**：确认文档内相对链接存在且代码块可无头运行。

## 3. 确定性脚本与 Reasoning-First 输出契约
```bash
python scripts/openapi_diff_gate.py --base <base.json> --target <new.json> --bump <patch|minor|major> [--changelog CHANGELOG.md]
```
- **退出码**：`0` (`PASSED`)、`1` (`BREAKING_SEMVER_VIOLATION`)、`2` (`SPEC_INVALID`)。
- **可复用函数**：`evaluate_release(base_spec, target_spec, bump, changelog_path)` 支持单测与流水线直接集成。
- **LLM 发布汇报结构**（`strict: true`, `additionalProperties: false`）：`reasoning -> breaking_changes -> bump_verdict -> docs_checklist`。

## Verification
运行 `pytest tests/test_phase1_skills.py -k docs_diataxis` 全绿：验证无约束收窄 enum 拦截、`major` 缺 changelog 拦截 `EXIT 2` 与最新块校验。
