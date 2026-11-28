# Red-Green Isolation SOP (红绿隔离与测试断言规范)

## 1. 严格红绿契约 (The Red-Green Contract)

```
[需求/Bug] -> 编写红灯单测 -> 物理运行 -> 必须 100% 出现指定失败 (RED)
                 |
                 v (若不失败，重写用例直到击中靶心)
              实施 AST 最小代码补丁
                 |
                 v
              物理运行单测 -> 必须 100% 变绿通过 (GREEN)
                 |
                 v
              零退化重构 (REFACTOR) -> 保持持续全绿
```

## 2. 隔离断言四大铁则

1. **Deterministic Input (输入确定性)**:
   - 严禁依赖 `Date.now()`, `Math.random()`, 真实外部网络。
   - 所有动态状态必须使用 Virtual Clock（虚拟时钟）与伪随机种子（PRNG Seed）。
2. **Explicit Assertions (显式断言)**:
   - 严禁空断言或宽泛断言（如仅检查 `result !== null`）。
   - 必须断言确切的字段值、状态转移与调用次数：
     ```typescript
     expect(response.status).toBe(200);
     expect(response.data.id).toMatch(/^tx_[a-zA-Z0-9]+$/);
     expect(mockNotificationService.send).toHaveBeenCalledTimes(1);
     ```
3. **Hermetic Teardown (清理彻底性)**:
   - 每个测试用例执行完毕后，必须清除本地临时文件、内存缓存与 Mock 状态（`afterEach(() => vi.clearAllMocks())`）。
4. **Stack Trace Verification (堆栈指纹验证)**:
   - 红灯阶段必须核对报错信息与堆栈指纹，防止因语法错、环境缺失等“假红灯”误导。
