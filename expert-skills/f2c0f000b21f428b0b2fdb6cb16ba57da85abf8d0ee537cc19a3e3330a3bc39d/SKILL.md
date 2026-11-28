---
name: rea-cleanroom-contract
description: 逆向生产级 Web 前端资产（Webpack/Next.js/RSC/obfuscator.io），还原 API 契约与状态机，并以净室方式交付可实施规格。用于"解包这个站点""还原它的接口""反混淆这个 bundle""做净室重构规格""逆向它的计费/成本模型"等任务。
---

# REA 净室契约还原

## 何时使用

- 拿到生产 bundle、chunk、HAR、SourceMap，需要搞清楚「它在做什么、调了什么接口」。
- 需要把竞品行为转成可实现规格，但不得复制其代码。
- 需要判断某个前端产品的模型调用、Token 规模与单次成本。
- 不适用：普通源码仓库的架构阅读（直接读代码即可）。

## 不可违反的四条

1. **证据分级**：L1 = 可回放流量或 SourceMap 原始文件；L2 = AST 推演；L3 = 假设。交付中逐条标注。
2. **净室隔离**：原始代码只进 `evidence/` 与 `unpacked/`；交给实现方的只有 schema、状态机、行为描述。
3. **AST 优先**：端点与调用链必须由 AST 追踪确认；grep 只能用于发现候选。
4. **安全执行**：任何还原字符串数组的求值都在断网、限时、限内存的沙箱内；绝不 `eval` 未隔离样本。

## 执行流程

### 第 1 步：立卷

```
case/
  scope.md          # 授权范围、速率、禁止项
  evidence/         # HAR、截图、响应体、哈希
  unpacked/         # 解包产物
  deobfuscated/     # 反混淆产物
  spec/             # 唯一可交付目录
  timeline.md       # 时间线（带时区）
```

记录目标、时间、Build ID、UA。无授权文本不进入下一步。

### 第 2 步：资产测绘

- 抓 HTML：`script[src]`、`link[rel=preload]`、内联脚本。
- Next.js Pages：`__NEXT_DATA__`、`_buildManifest.js`。
- Next.js App Router：`self.__next_f.push([type, data])`；type 1 为数据，行格式 `id:tag:data\n`，2KB 分片按序拼接。
- 枚举动态 chunk，写 `assets.csv`：`url,type,hash,size,discovered_from,status`。
- SourceMap 探测：`sourceMappingURL`、`.map`、`data:application/json;base64,`。

**门禁**：chunk 数与 manifest 一致；缺项写原因。

### 第 3 步：按阶梯恢复源码

```bash
# 1) SourceMap 优先
sourcemapper -url https://target/app.js.map -output unpacked/src
unmapjs --url https://target -o unpacked/src

# 2) 结构化解包
npx wakaru bundle.js --unpack=strict -o unpacked/
npx wakaru dist/ --unpack=inspect -o unpacked/     # 边界不清时

# 3) 反混淆
npx webcrack bundle.js -o deobfuscated/
npx obfuscator-io-deobfuscator -o deobfuscated/clean.js   # 专杀，零执行

# 4) 可选：LLM 仅命名（AST 执行重命名）
npx webcrack < bundle.js | humanify anthropic - -o deobfuscated/named.js
```

在 `recovery.md` 写清：哪一级成功、丢了什么、哪些模块仍是压缩态。

### 第 4 步：反混淆判定

obfuscator.io 指纹：`_0x` 变量 + 顶层字符串数组 + 旋转 IIFE + `while/switch` 分发 + `"3|1|4|0".split("|")`。

处理顺序：
1. 执行旋转，求出数组真实顺序。
2. 内联解码函数与代理函数（作用域安全）。
3. 常量折叠、对象/数组内联、死代码消除。
4. 展开控制流平坦化：按分发数组顺序拼接 basic block，删除分发变量与 `continue`。
5. 语法糖还原（可选链、空值合并、模板字符串、JSX）。

自写变换用 Babel + `@codemod/matchers`；每次变换后跑「同输入同输出」或关键路径回放。

### 第 5 步：契约提取

用 ast-grep 定位候选：

```bash
ast-grep scan --inline-rules '
id: http-calls
language: JavaScript
rule:
  any:
    - pattern: fetch($URL, $$$INIT)
    - pattern: axios.$METHOD($URL, $$$ARGS)
    - pattern: $CLIENT.post($URL, $$$ARGS)
' unpacked/
```

对每个调用点确认：baseURL 拼接、路径模板、方法、鉴权头、签名参数、重试、超时、幂等键。
然后用 Burp/代理做最小重放（只读优先），把结果写进 `spec/openapi.yaml` 与 `spec/contract-matrix.md`。

**门禁**：每个端点至少一条 L1；无证据标 L3 并给验证方案。

### 第 6 步：状态机与净室交付

- 只写状态、事件、守卫、副作用，不保留原变量名/注释/独特字符串。
- 输出 `spec/state-machine.mmd` 与 `spec/openapi.yaml`。
- 对 `spec/` 与目标源码做最长公共子串扫描；连续 ≥40 字符且非 API 字段名即阻断。
- 记录交接人与审查结论。

### 第 7 步：成本对账

采集 `usage`、`model` 回显、限流头、SSE 事件、TTFT。
按厂商口径归一：
- Anthropic：`input_tokens` 不含缓存；总量 = `input + cache_read + cache_creation`。
- OpenAI 兼容：`prompt_tokens` 含缓存；未缓存 = `prompt - cached`。

```
cost = Σ(uncached_in*p_in + cache_read*p_cache + cache_write*p_cache_write
        + output*p_out + reasoning*p_out + fees)
```

输出区间与敏感性表（价格 ±20%、缓存命中 0/50/90%、重试 0/5%），价格注明抓取日期与来源。

## 交付模板

```
1. 结论摘要（带 L1/L2/L3）
2. 目标拓扑（框架、构建器、chunk 图、第三方）
3. 恢复路径与信息损失
4. 契约矩阵（endpoint/method/auth/schema/errors/evidence/confidence）
5. 状态机
6. 成本模型（公式、假设、区间）
7. 净室边界声明
8. 残余风险
```

## 常见坑

- 直接对整包 grep `https://`：会把埋点、CDN、错误上报混进契约，必须 AST 回溯到调用点。
- 忘记字符串数组旋转：索引全错，得到看似合理但错误的字符串。
- 把 `input_tokens` 当总量：Anthropic 会漏算缓存读写，成本低估。
- 在宿主环境跑 `isolated-vm`：Node 22/24 以外版本易 ABI 崩溃；用容器固定版本。
- LLM 生成的变量名当事实：命名只影响可读性，不改变证据等级。
- 交付里带原始注释/命名：破坏净室隔离，必须扫描后再交付。
