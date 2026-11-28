# CLI Non-Blocking Driver Protocol (无交互无头 CLI 流控协议)

## 1. 挂起源分析与三大死锁陷阱

在无头（Headless）自主 Agent 运行环境中，任何交互式输入阻塞都会直接导致任务死锁或超时熔断：
1. **Paging Trap (分页陷阱)**: `git diff`, `git log`, `man` 默认调用 `less` 或 `more`，等待用户按 `q` 退出。
2. **Prompt Confirmation Trap (确认提问陷阱)**: `rm -i`, `npm init`, `apt-get` 弹出 `Are you sure? (y/N)`。
3. **Long-Running Process Lock (长进程守护陷阱)**: `npm run dev`, `webpack --watch` 持续占用前台 stdout/stderr，永远不返回退出码。

## 2. 硅谷顶级无头驱动标准配置

### 2.1 强制注入环境变量 (Environment Sanitization)
```bash
# 通用系统级
export CI=true
export PAGER=cat
export GIT_PAGER=cat
export TERM=dumb

# 包管理器级
export NPM_CONFIG_YES=true
export PNPM_FLAGS="--frozen-lockfile --prefer-offline"
export PIP_NO_INPUT=1
export PIP_DISABLE_PIP_VERSION_CHECK=1
```

### 2.2 命令执行包装器规范 (Command Execution Envelope)
在执行可能产生长输出或挂起的命令时，必须实施以下包装：

```bash
# 限制输出行数与强制超时 (Windows PowerShell 示例)
$process = Start-Process -FilePath "pnpm" -ArgumentList "test --run" -NoNewWindow -PassThru -RedirectStandardOutput "out.log" -RedirectStandardError "err.log"
if (-not $process.WaitForExit(30000)) { # 30秒硬超时
    $process.Kill()
    Write-Error "Command timed out after 30s"
}
```

## 3. 工具状态生命周期管理
- **Foreground Fast-Path**: 预期执行时间 < 5000ms 的操作（如 `git status`, `vitest run single_test`），同步等待结果。
- **Background Async-Path**: 耗时较长操作（构建、全量回归），挂起为后台 Task，记录 Task ID 并通过事件回调响应，禁止轮询死循环。
