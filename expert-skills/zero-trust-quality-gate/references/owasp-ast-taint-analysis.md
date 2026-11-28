# OWASP Top 10 静态污点追踪与 AST 审查指南

## 1. 静态污点分析核心理论 (Sources, Sinks, Sanitizers)

静态污点追踪（Taint Tracking）是发现隐蔽注入与越权漏洞的核心利器。其核心模型包含三要素：

1. **污点源 (Sources)**：来自不受信环境的用户输入数据：
   - HTTP 请求参数：`req.body`, `req.query`, `req.params`, `req.headers`
   - 外部环境与存储：`process.env`, `fs.readFile`, `fetch()`, 消息队列载荷
2. **汇聚点 (Sinks)**：执行高危系统操作的底层函数：
   - 数据库操作：`db.query()`, `prisma.$queryRawUnsafe()`, `cursor.execute()`
   - 命令执行：`child_process.exec()`, `os.system()`, `subprocess.Popen(shell=True)`
   - 动态代码求值：`eval()`, `new Function()`, `vm.runInContext()`
   - 模板与前端输出：`dangerouslySetInnerHTML`, `res.send()`, `document.write()`
3. **净化器与校验网关 (Sanitizers & Validators)**：阻断污点流动的安全屏障：
   - 严格类型校验与 Schema 验证：`zod.parse()`, `pydantic.BaseModel`
   - 参数化绑定 (Parameterized Binding)：SQL 预编译占位符 (`$1, ?`)
   - 字符转义与白名单过滤：`DOMPurify.sanitize()`, `shlex.quote()`

---

## 2. 核心漏洞模式与 AST 匹配规则

### A. SQL 注入 (SQLi) 拦截
- **高危模式**：使用字符串插值、模板字符串或拼接方式向原生查询函数传参：
  ```typescript
  // BAD: 字符串拼接污点流入 Sink
  db.query(`SELECT * FROM users WHERE email = '${req.body.email}'`);
  ```
- **AST 审查判定**：检查 `CallExpression` 的调用者为数据库驱动，且首个实参为 `TemplateLiteral` 或带 `BinaryExpression(+)` 且包含非字面量变量。
- **安全修复**：
  ```typescript
  // GOOD: 参数化预编译查询
  db.query('SELECT * FROM users WHERE email = $1', [req.body.email]);
  ```

### B. 系统命令注入 (Command Injection) 拦截
- **高危模式**：将外部参数拼入系统 shell 执行命令：
  ```python
  # BAD: shell=True 且拼接不受信入参
  subprocess.Popen(f"ping -c 1 {user_ip}", shell=True)
  ```
- **安全修复**：
  ```python
  # GOOD: 传参列表化并关闭 shell 包装
  subprocess.Popen(["ping", "-c", "1", user_ip], shell=False)
  ```

### C. 服务器端请求伪造 (SSRF) 拦截
- **高危模式**：客户端直接控制服务端的内部请求 URL：
  ```typescript
  // BAD: 直接请求不受信用户提供的 URL
  const target = req.query.url;
  await fetch(target);
  ```
- **安全修复**：建立严格的域名与 IP 白名单网关，强制解析 DNS 并过滤私有地址（`127.0.0.1`, `10.0.0.0/8`, `192.168.0.0/16` 等）。
