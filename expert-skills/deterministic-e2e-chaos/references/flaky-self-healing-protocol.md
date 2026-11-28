# Flaky Test Self-Healing & Triage Protocol (偶发测试自愈与归因隔离规约)

## 1. Flaky 测试零容忍原则
在硅谷顶级团队，Flaky 测试被视为严重代码债务，任何有 > 1% 偶发失败率的测试必须在 2 小时内响应并处置。

## 2. 4 步处置工作流 (Quarantine -> Forensics -> Repro -> Un-quarantine)

```
[检测到 Flaky] -> [1. 立即隔离至 Quarantine] -> [2. Trace 深度时序取证]
                                                        |
                                                        v
[4. 50 次并发压测全绿] <- [3. 修复竞态条件并生成 Repro Pack]
```

1. **Step 1: 立即隔离 (Quarantine)**:
   - 将问题用例标记为 `@flaky`，移出主门禁 CI 阻塞链路，防止阻塞全员发布。
2. **Step 2: 时序取证 (Forensics)**:
   - 打开 `trace.zip`，检查 Action Timeline，定位是 DOM 重绘未就绪、网络响应乱序还是全局状态泄露。
3. **Step 3: 确定性修复 (Fix)**:
   - 替换死等为 Web-First 显式断言；注入 Virtual Clock；添加隔离 Teardown。
4. **Step 4: 50 次压力验证 (Stress Run)**:
   - 本地循环执行 50 次用例：`for ($i=1; $i -le 50; $i++) { pnpm test target.spec.ts }`。
   - 必须保持 50/50 连续全绿，方可解除隔离移回主门禁。
