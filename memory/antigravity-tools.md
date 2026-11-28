---
title: antigravity tools
aliases: [proxy, accounts, openmausbot, network]
---

- 2026-11-20 · from chat "我用他反代，感觉还是有号被封，是什么原因，可能是什么问题怎么修复，帮我找到问题的根源" (noticed) · In Antigravity Tools, each account is configured with a dedicated proxy.

## 2026-11-20 联合防封与防断连根因复盘及基线配置

### 1. 五大核心根因
1. **跨端口串 IP 与同号双跑 (`antigravity-sync-daemon`)**：守护进程会探测配额/429 并把 Antigravity Tools 账号的 `acp_token.json` 跨写进 OpenMausBot 实例目录，却**不会同步改写** `config.json` 中对应实例的 `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY`，导致同一刷新令牌短时间内同时出现在“Tools 反代端口”和“OpenMausBot 原生代理端口”两个出口 IP 上（触发风控/封号与断连）。
2. **`OAuth aicode scope` 能力分化**：Google OAuth 账号存在 `aicode` scope 差异。仅 `aicode=true` 账号可用于 OpenMausBot 原生 Antigravity ACP（`antigravity*` 实例）；`aicode=false` 账号只能留在 Antigravity Tools `:8045` 反代网关使用，若被误同步到原生 ACP 必定 403/断连。
3. **Tools 后台风暴与高并发**：`auto_refresh: true`、`startup_refresh: true`、`scheduled_warmup.enabled: true` 叠加全量/已死账号（`invalid_grant` / `forbidden` / `validation_blocked`）周期刷接口，且默认 `per_account_concurrency=2`、`qos_auto_jail=false`、`auto_failover=true`，易引发 429 级联与风控连坐。
4. **BOM 与重复环境变量污染**：
   - `gui_config.json` 或 `accounts.json` 带 UTF-8 BOM（`0xEF 0xBB 0xBF`）会导致 Rust `serde_json` 解析失败，使 Antigravity Tools 反代服务无法拉起。
   - `config.json` 实例 `environment` 同时存在大写 `HTTP_PROXY` 和小写 `http_proxy` 重复键，易引发子进程代理优先级冲突。
5. **Tools 端可见性与反代调用冲突**：OpenMausBot 独占账号若直接从 Tools 删除，用户无法在 Tools 面板直观监控配额；必须**保留在 Tools 列表 + 保持 1:1 专属代理绑定 + 设为 `proxy_disabled: true` / `manual_proxy_disabled: true`**，做到“可见但不参与 `:8045` 反代调度”。

### 2. 双池硬隔离与 1:1 专属代理映射（已实测核验）

#### Pool A：OpenMausBot 原生 ACP 独占（6 个，`aicode=true`）
> 在 Antigravity Tools 中保留账号与 1:1 代理绑定以供观察，但均设 `disabled: false`、`manual_proxy_disabled: true`、`proxy_disabled: true`（`proxy_disabled_reason: "OpenMausBot 原生独占，关闭反代调用"`），`:8045` 绝不调度；且已清理原重复实例 `antigravity-1f6e9012-d3a5-415f-9048-b98a7330846f`。

| 账号邮箱 | 等级 | 专属端口 | OpenMausBot 实例 ID |
| --- | --- | --- | --- |
| `frank20170808@gmail.com` | PRO | `:30082` | `antigravity`（默认） |
| `celajoseph342@gmail.com` | PRO | `:30069` | `antigravity-e7588a90-5566-5f62-b376-c557bcb62490` |
| `nsubugae96@gmail.com` | PRO | `:30072` | `antigravity-80e5a56d-57db-5e0f-8b06-7e45b0282b70` |
| `leongetotp@gmail.com` | PRO | `:30068` | `antigravity-2f2e563d-dcd1-59db-b445-ec73101db0df` |
| `suxipesove34@gmail.com` | PRO | `:30075` | `antigravity-4a06f547-9b9c-5d2b-9664-178ab65ab4bd`（Simone PRO） |
| `toms19940122@gmail.com` | FREE | `:20002` | `antigravity-853bacaa-392f-51e6-8075-4ea51d5b8f65`（仅作兜底备池） |

#### Pool B：Antigravity Tools `:8045` 独立反代池（5 个健康 PRO，`aicode=false`）
> 仅供大消耗 Token 任务通过 `:8045` 网关（及 `antigravity-local-gateway`）调用，全部 `proxy_disabled: false` 且 1:1 专属代理。

- `kokovupa040@gmail.com` (`:30054`)
- `mohamedyusufjama75@gmail.com` (`:30061`)
- `delida825@gmail.com` (`:30055`)
- `everitteversman@gmail.com` (`:30065`)
- `umetoqurome841@gmail.com` (`:30058`)

#### 离线归档（`C:\Users\frank\.antigravity_tools\backup_cleanup_20261120`）
- 4 个 `invalid_grant` / `forbidden` 废号 + 1 个未绑代理 `forbidden` 号（已从运行态移除）
- `yezefobel619@gmail.com`（`:30060`，`validation_blocked`，待人工完成账号验证后再决定启用）
- `28858450@qq.com`（`:30066`，健康 FREE，`aicode=false`）

### 3. 硬性运维铁律
1. **严禁启用 `antigravity-sync-daemon`**（已执行 `--uninstall-autostart` 并移除 Startup VBS 自启与锁文件），禁止任何外部脚本跨实例覆写 `acp_token.json`。
2. **Tools 加固参数（`gui_config.json`）**：`auto_refresh: false`、`startup_refresh: false`、`auto_sync: false`、`scheduled_warmup.enabled: false`、`proxy.image_scheduler.per_account_concurrency: 1`、`proxy.qos_auto_jail: true`、`proxy.proxy_pool.auto_failover: false`、`proxy.preferred_account_id: null`。
3. **JSON 写入零 BOM 铁律**：修改 `gui_config.json`、`accounts.json`、`config.json` 必须使用无 BOM UTF-8（例如 `[Text.UTF8Encoding]::new($false)` 或 Node `fs.writeFileSync(..., 'utf8')`），严禁 PowerShell `Set-Content -Encoding UTF8`（Windows PowerShell 5.1 会默认写入 BOM）。
4. **OpenMausBot 配置与调参经验**：
   - `config.json` 中每个 `antigravity*` 实例仅保留大写 `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY`，禁止大小写重复键。
   - 未配对手机端（`!desktopPhones()`）时，`app_settings(bots.model)` 的 `turnOwner` 校验可能误报 403；修改自身模型使用 `propose_model`（推理档位字段为 `variant`），批量改团队模型需经主控 Bot 的 `propose_team_setup`。