---
name: offensive-security
description: "代码评审员（Mode A 对内红队与 OWASP/Prompt 注入加固）与逆向分析师（Mode B 对外履约反爬/JA4/CDP 去指纹对抗）按需加载的双模红队安全契约。"
---

# Dual-Mode Offensive Security & Zero-Trust Gate (`offensive-security`)

## When to Use
- **Mode A (`internal-defense` · 仅限 `代码评审员`)**：审查 PR 安全面、LLM 间接提示词注入/Tool Poisoning、HMAC/Ed25519 恒定时间验签（拦截 `==` 与 `!=`）及硬编码密钥扫描。
- **Mode B (`external-antidetect` · 仅限 `逆向分析师`)**：排查履约浏览器 JA4/TLS 碰撞、CDP 探测、未剥离的 MV3 `Origin: chrome-extension://` 泄露与互相冲突的扩展启动参数组合。

## Excluded When (DO NOT)
- **DO NOT** 允许 `代码评审员` 执行对外爬虫反爬对抗，或允许 `逆向分析师` 越权签发对内业务 PR 安全 `APPROVE`（严格物理划界，防止越权混审）。
- **DO NOT** 对未授权第三方生产系统发起破坏性渗透、DoS 压测或保留明文密钥。
- **DO NOT** 用粗糙子串正则把合法的 MV3 DNR 剥离规则（`remove` `Origin`）或合法单用 `--load-extension` 的启动器误报为漏洞（须用语义冲突检测并支持 `--exclude` 排除测试 fixture）。
- **DO NOT** 在无物理工具输出凭证时口头签发“理论上安全”。

## 1. 双模物理边界与红线门禁
| 模式 | 责任席位 | 核心防御/对抗面 | 阻断判据 (P0 = REJECT) |
| :--- | :--- | :--- | :--- |
| **Mode A: 对内红队** | `代码评审员` (异构强脑) | ① OWASP ASVS (BOLA/BFLA/SSRF/SQLi)；<br>② 恒定时间验签 (`hmac.compare_digest`/`timingSafeEqual`) + 防重放窗 (`<= 30s`)；<br>③ LLM `<untrusted_data>` 沙箱与 PII 零泄露 | 硬编码密钥、签名 `==`/`!=` 非恒定时间比较、`shell=True`/`eval` 注入、禁用 TLS 校验 |
| **Mode B: 对外对抗** | `逆向分析师` (Ring 2 外挂) | ① JA4/TLS/HTTP2 与宿主 OS 一致性；<br>② 禁 `MAIN`-world `Object.defineProperty(navigator, ...)`；<br>③ MV3 `declarativeNetRequest` 剥离 `chrome-extension://`；<br>④ 临时 CDP Override 用完即复原 | 未剥离的 `chrome-extension://` Origin 暴露、同文件冲突启动参数（如 `--disable-extensions` 与 `--load-extension` 共存）、广域 `accounts.google.com/*` 污染 |

## 2. 边缘近似正反例、脚本与 Reasoning-First 输出契约
- **边缘正例（严禁误报，必须 `EXIT 0`）**：① MV3 DNR 规则中出现 `chrome-extension://` 配合 `operation: "remove"` / `modifyHeaders` 剥离 Origin；② 合法 launcher 仅传入 `--load-extension=/path/ext` 且无冲突 `--disable-extensions`。
- **边缘反例（必须 `EXIT 1`）**：① `if signature != expected:`（非恒定时间 `!=` 漏判修复）；② 同文件同时出现 `--disable-extensions`（非 `-except`）与 `--load-extension` 参数冲突。
```bash
python scripts/security_preflight.py --target <repo_or_file> --mode <internal-defense|external-antidetect> [--exclude <glob>] [--exclude-tests]
```
- **退出码**：`0` (`CLEAN`)、`1` (`REJECT_FINDINGS`)、`2` (`SPEC_INVALID`)。
- **LLM 审计输出结构**（`strict: true`, `additionalProperties: false`）：`reasoning -> findings -> severity_summary -> verdict`。

## Verification
运行 `pytest tests/test_phase1_skills.py -k offensive_security` 全绿：验证 Mode A 捕获 `!=` 与 `--exclude-tests` 豁免、Mode B 对合法 DNR 剥离与合法 launcher 零误报且精准拦截冲突组合。清单见 [references/dual-mode-checklists.md](references/dual-mode-checklists.md)。
