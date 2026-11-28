---
name: surgical-tdd-isolation
description: "面向全栈开发工程师的硅谷顶级工程标准技能：基于 Claude Code / OpenAI Codex 原生 SDK 与 AST 语法树的零挂起外科手术式 TDD 隔离重构引擎。贯彻严格红绿隔离断言、AST 局部改写与无交互挂起 CLI 流控。"
---

# Surgical TDD Isolation & Headless CLI Engine (外科手术式 TDD 隔离开发技能)

## 1. 核心定位与设计原则 (Core Tenets)

本技能专为**全栈开发工程师 (Dev-Engineer)** 量身定制，深度对齐 Anthropic Claude Code、OpenAI Codex 团队核心工程师的日常研发基准。坚决杜绝“盲目全文件覆写导致上下文污染”、“先写实现后补无意义测试”以及“终端交互挂起死锁”三大行业通病。

### 核心铁律 (The 4 Inviolable Laws)
1. **Zero Production Edits Without Failing Test (无红灯不出刀)**:
   - 严禁在未经红灯测试验证前修改任何业务代码。
   - 必须先编写针对具体 Bug 复现或新需求契约的隔离测试用例，在沙盒中物理执行并**亲眼见证红灯报错（RED）**，且报错堆栈必须与预期根因严格匹配。
2. **AST-Level Surgical Precision (AST 级外科手术改写)**:
   - 坚决摒弃粗暴的全文件重写或大范围模糊正则替换。
   - 必须基于 AST（抽象语法树）进行节点级定位（如函数签名、类方法、AST 块级节点），只做最小必要变更（Minimal Blast Radius），严格保留原有注释、代码风格与上下文完整性。
3. **Non-Blocking Headless CLI Discipline (无挂起无头 CLI 纪律)**:
   - 所有终端命令必须声明非交互参数（如 `--yes`, `-y`, `--batch`, `--non-interactive`）。
   - 强制设置进程级超时上限（Timeout Guard）与 `PAGER=cat`，杜绝任何交互式分页器（less/more/vim）或等待确认（y/N prompt）导致终端永久挂起。
4. **Hermetic Test Double Isolation (测试双重密封隔离)**:
   - 单元测试与集成测试必须严格隔离外部网络、生产数据库与非幂等随机状态。
   - 外部调用必须通过强契约打桩（Stub/Mock）或本地内存容器承载，保证测试运行速度在毫秒级，且在任何环境均 100% 幂等可重复。

---

## 2. 标准外科手术四步流 (SOP: Red-Green-Refactor-Isolate)

### Phase 1: 隔离红灯用例编写 (Isolate & Assert Red)
1. 分析需求或 Bug 现象，在对应测试目录下创建或定位隔离测试文件（如 `*.spec.ts`, `test_*.py`）。
2. 构建隔离上下文：注入确定性测试数据，拦截外部 I/O。
3. 运行单个测试文件：
   ```bash
   # TypeScript / Node.js
   pnpm test -- tests/unit/target.spec.ts --run
   # Python
   pytest tests/unit/test_target.py -v
   ```
4. **红灯硬门禁**：确认控制台输出非 0 退出码，且报错信息包含预期的 `AssertionError` 或期望错误码。若测试直接通过，说明测试未击中要害，必须重写测试。

### Phase 2: AST 级外科手术修补 (Surgical AST Patch)
1. 通过精确语法分析（AST Node Query）锁定目标文件中的具体代码段。
2. 仅修改最小代码块（<= 15 行或仅涉及目标函数的 AST 节点）。
3. 再次运行单测，验证控制台输出退出码为 0，测试变为绿色（GREEN）。

### Phase 3: 零负面重构 (Refactor under Green Harness)
1. 优化变量命名、提取公共常量、精简逻辑复杂度。
2. 每次重构微调后立即重新触发单测，确保从未破坏已有契约。

### Phase 4: 爆炸半径与全局回归 (Blast-Radius Verification)
1. 运行相关模块的所有回归测试，确保未对关联模块造成二次破坏。
2. 检查 Git Diff，确认改动行数紧凑，无多余空行、格式化抖动或无关文件变更。

---

## 3. 顶级工具链与流控规范 (Toolchain & Execution Protocol)

### 3.1 零挂起 CLI 环境变量与命令规约
在执行终端指令时，必须在执行上下文注入以下标准防护：

```bash
# 1. 禁用所有交互式分页器
export PAGER=cat
export GIT_PAGER=cat

# 2. 强制非交互与静默模式
export CI=true
export DEBIAN_FRONTEND=noninteractive
export NPM_CONFIG_YES=true
```

### 3.2 常见命令安全防护表
| 命令类别 | 危险命令 (严禁执行) | 安全外科手术命令 (硅谷标准) |
|---|---|---|
| 包安装 | `npm install` (可能卡在 postinstall 或冲突) | `pnpm install --frozen-lockfile --prefer-offline` |
| 测试执行 | `npm test` (可能运行全局超长用例或卡在 watch) | `npx vitest run path/to/spec.ts --reporter=verbose` |
| Git 操作 | `git add . && git commit` (盲目全量提交) | `git add path/to/exact_file && git diff --staged` |
| 查找与过滤 | `grep -r text .` (可能陷入 node_modules 大泥潭) | `ast-grep --pattern '$$$PATTERN' --lang ts` 或 `ripgrep` |

---

## 4. 负向禁令与反模式熔断 (Anti-Patterns)

- 严禁全文件覆写 (No Whole-File Overwrites)：对于超过 100 行的代码文件，严禁使用整文件替换命令。必须基于 AST 节点或精确局部替换。
- 严禁跳过红灯 (No Skipping the Red Phase)：任何直接进入“我已编写好实现，顺便写个测试”的行为一票否决。
- 严禁伪绿灯测试 (No Assert-Free Tests)：严禁编写没有明确断言或仅断言 `expect(true).toBe(true)` 的占位符测试。
- 严禁挂起等待 (No Interactive Prompts)：严禁执行会弹出 `Overwrite file? [y/n]` 或 `Select options:` 的交互式命令；必须预先注入 `-y` 或对应配置参数。

---

## 5. 参考子文档导引 (References)
- 语法树外科手术改写规范: [ast-surgical-rewriter.md](references/ast-surgical-rewriter.md)
- 无交互无头 CLI 流控协议: [cli-nonblocking-driver.md](references/cli-nonblocking-driver.md)
- 红绿隔离与测试断言 SOP: [red-green-isolation-sop.md](references/red-green-isolation-sop.md)
- 外科手术改写 JSON 模板: [surgical_patch_template.json](templates/surgical_patch_template.json)
- 隔离单测实操代码样例: [test_isolation_spec.ts](templates/test_isolation_spec.ts)
