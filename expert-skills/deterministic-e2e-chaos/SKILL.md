---
name: deterministic-e2e-chaos
description: "面向测试质保工程师的硅谷顶级工程标准技能：基于 Playwright 确定性无头 E2E 质保与 Netflix 混沌工程故障注入体系。包含网络抖动/429/500/断网注入、稳态假设断言与 Flaky 零容忍自愈包。"
---

# Deterministic E2E & Netflix Chaos Engineering Skill (确定性 E2E 与混沌注入技能)

## 1. 核心定位与设计原则 (Core Tenets)

本技能专为**测试质保员 (QA-Engineer)** 量身定制，将 Netflix 混沌工程（Chaos Engineering）体系与微软 Playwright 顶配 E2E 自动化框架深度熔接。彻底终结“线上偶发白屏不可测”、“弱网超时逻辑崩溃”、“Flaky 假报警推诿”三大质量死角。

### 核心铁律 (The 4 Inviolable Laws)
1. **Steady-State Hypothesis First (稳态假设先行)**:
   - 任何混沌实验注入前，必须定义系统的“正常稳态指标”（Steady-State Baseline，如无未捕获异常、UI 降级提示呈现、操作可重试）。
   - 故障注入的成败不取决于系统是否报错，而取决于系统在故障冲击下是否**优雅降级并在故障消除后秒级自愈**。
2. **Zero-Flake Deterministic Locators (零 Flaky 确定性定位器)**:
   - 严禁使用动态 CSS 类名（如 `.css-19ba8x`）或脆弱的 XPath 绝对路径。
   - 100% 采用基于语义的不可变定位器：`page.getByRole(...)`, `page.getByTestId(...)`, `page.getByLabel(...)`。
3. **Hermetic Virtual Sandbox (密闭虚拟沙盒)**:
   - 每个测试用例享有绝对独立的 BrowserContext，Cookie、LocalStorage 与 IndexedDB 完全隔离。
   - 强制使用 `page.clock.install()` 接管浏览器时钟，消除 `setTimeout` / 防抖节流带来的测试耗时与竞态抖动。
4. **Deterministic Repro Pack Generation (确定性复现包归档)**:
   - 任何测试失败必须自动捕获三件套：Trace 文件（`trace.zip`）、网络归档（HAR）、控制台日志与失败瞬间 DOM 快照，确保全栈开发在离线沙盒中 100% 毫秒级复现。

---

## 2. 混沌工程四大注入矩阵 (Chaos Injection Matrix)

| 混沌类型 | 注入场景 (Fault Pattern) | 预期稳态与韧性行为 (Steady-State Assertion) |
|---|---|---|
| **CHAOS-01: Network Jitter** | 核心 API 响应延迟随机注入 1000ms~4000ms | 界面展示骨架屏 (Skeleton)，防止用户重复点击，按钮处于 disabled 状态 |
| **CHAOS-02: Rate Limit (429)** | 突发注入 HTTP 429 Too Many Requests 与 Retry-After | 客户端遵循指数退避自动静默重试，不得弹出阻断式 Alert 报错 |
| **CHAOS-03: Gateway Cascade (502/503)** | 上游网关返回 502 Bad Gateway 或空响应体 | 页面优雅展示“服务繁忙稍后重试”并提供一键重试动作，未捕获异常数为 0 |
| **CHAOS-04: Network Partition (Offline)** | 突然调用 `context.setOffline(true)` 中断网络 | 本地状态机转入离线队列 (Offline Queue)，网络恢复后自动对账同步 |

---

## 3. 标准质保流水线 (SOP: 5-Step E2E Chaos Cycle)

```
[基线测试] -> [注入混沌故障] -> [校验稳态假设] -> [撤销故障恢复] -> [归档复现包]
```

1. **Step 1: 建立稳态基线 (Establish Steady-State Baseline)**:
   - 驱动页面进入目标状态，验证核心业务指标正常。
2. **Step 2: 动态路由拦截与混沌注入 (Inject Fault via Playwright Route)**:
   - 针对指定 API 路径调用 `page.route()` 注入延迟、HTTP 错误码或异常 Body。
3. **Step 3: 韧性边界断言 (Assert Resilience Boundaries)**:
   - 断言降级 UI 是否如期渲染，断言控制台无致命未捕获 Promise Rejection。
4. **Step 4: 自愈验证 (Verify Self-Healing Recovery)**:
   - 释放路由拦截（`route.fallback()` 或撤销 offline），触发重试，断言业务最终成功一致性。
5. **Step 5: 故障打包与离线证据链 (Package Repro Artifacts)**:
   - 若断言失败，将 `trace.zip`, `network.har`, 失败截图自动压缩为统一 Repro Pack 交付全栈开发。

---

## 4. 负向禁令与反模式熔断 (Anti-Patterns)

- 🚫 **严禁使用任意休眠 (No Arbitrary `page.waitForTimeout(N)`)**：这是产生 Flaky 测试的头号元凶。必须使用 Web-First 断言 `expect(locator).toBeVisible()` 或显式等待条件。
- 🚫 **严禁跨测试状态污染 (No Shared State Between Tests)**：测试之间严禁共享全局变量或重用脏 StorageState。
- 🚫 **严禁忽视控制台未捕获错误 (No Silent Console Errors)**：测试监听 `page.on('console', msg => ...)` 与 `page.on('pageerror', err => ...)`，任何未捕获异常默认判负。
- 🚫 **严禁无复现包报 Bug (No Bug Reports Without Repro Pack)**：报送缺陷必须附带包含 trace 与 HAR 的完整复现包。

---

## 5. 参考子文档导引 (References)
- Netflix 混沌工程实战注入矩阵: [netflix-chaos-injection.md](references/netflix-chaos-injection.md)
- 微软 Playwright 零 Flaky 沙盒装配指南: [playwright-sandbox-harness.md](references/playwright-sandbox-harness.md)
- 偶发测试自愈与归因隔离规约: [flaky-self-healing-protocol.md](references/flaky-self-healing-protocol.md)
- 混沌注入可运行用例脚本: [chaos_fault_injection.spec.ts](templates/chaos_fault_injection.spec.ts)
- 确定性复现包自动生成脚本: [repro_pack_generator.py](templates/repro_pack_generator.py)
