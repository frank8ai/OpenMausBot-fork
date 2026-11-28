# AST-Surgical Rewriter Specification (语法树外科手术改写规范)

## 1. 为什么坚决弃用整文件覆写与模糊正则
在 LLM/Agent 辅助软件工程中，全文件覆写（Whole-File Overwrite）是导致代码幻觉、破坏既有注释与引发上下文爆炸的最大元凶：
1. **上下文截断与幻觉丢失**：大文件重写时，模型极易遗漏未改动的周边方法或常量，导致代码静默蒸发。
2. **Git Diff 污染**：格式化工具的细微差异会导致数千行无意义 diff，彻底瘫痪代码评审（PR Review）。
3. **模糊正则失效**：字符串替换无法感知语法上下文（如字符串字面量 vs 函数调用 vs 类型声明）。

## 2. 基于 ast-grep 与 Tree-sitter 的节点匹配范式

### 2.1 结构化匹配规则 (Structural Pattern Matching)
利用 `ast-grep`，全栈工程师可以编写语法级别的精准查询：

```yaml
# rules/replace-deprecated-api.yml
id: replace-legacy-fetch
language: typescript
rule:
  pattern: $CLIENT.request({ url: $URL, method: 'GET' })
fix: $CLIENT.get($URL)
```

### 2.2 多行代码块精确定位
当需要重构特定方法内部实现时，通过 AST 选择器锁定范围：
- **Target Node**: `method_definition[name='processOrder'] > statement_block`
- **Range Boundary**: 精确捕获其起止行号与列号（`start_point`, `end_point`）。
- **Replacement Scope**: 仅替换函数体内的陈旧逻辑，保持方法签名、JSDoc/TypeDoc 和周围代码 100% 冻结。

## 3. 外科手术改写执行 SOP

1. **AST 预检 (Dry-Run Parse)**:
   - 读取目标文件源码，使用对应语言 Parser 构建 AST。若解析报错，立即阻断，严禁在损坏的代码上动刀。
2. **节点锚定 (Node Anchor)**:
   - 提取唯一语法特征（如类名 + 方法名 + 参数类型）。
3. **差异生成与验证 (Diff Synthesis & Verification)**:
   - 生成 Unified Diff，检查改动行数（Lines Changed <= 15）。
   - 验证替换后的代码在内存中重新 Parse 为有效 AST。
4. **原子落盘 (Atomic Disk Commit)**:
   - 写入临时缓冲文件并原子重命名（Atomic Rename），杜绝文件写入中断导致的半损坏状态。
