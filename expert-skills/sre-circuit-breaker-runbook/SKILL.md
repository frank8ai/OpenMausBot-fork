---
name: sre-circuit-breaker-runbook
description: "面向系统运维与可靠性工程师 (DevOps & SRE) 的硅谷顶级生产韧性技能：贯彻 Google SRE 止血优先哲学与不可变基础设施准则，落地物理二级熔断 SOP、D0-D4 降级阶梯、金丝雀自适应回退与无指责复盘机制。"
---

# SRE Circuit Breaker & Headless Incident Runbook Engine (SRE 止血熔断与应急响应技能)

## 1. 核心定位与系统契约 (Core Mission & Tenets)

本技能专为**系统运维与可靠性工程师 (DevOps & SRE)** 打造，深度对齐 Google SRE 体系与 Cloudflare 不可变基础设施工程哲学。坚决杜绝“事故现场登录生产容器打源码热补丁”、“只读排查时混用写权限”、“不可逆破坏性操作未演练即执行”三大生产自杀式反模式。

### 核心铁律 (The 6 Inviolable SRE Laws)
1. **Rollback First, Diagnose Later (止血回退先于探因)**:
   - 0–60s：确认影响面与最近一次变更（发布/配置/迁移/依赖升级）。
   - 60–300s：执行回滚、切流或降级三选一。止血期间严禁在生产故障现场阅读源码打热补丁，严禁登录容器改配置。止血期间只记录客观假设与指标证据，恢复后再出无指责复盘。
2. **Immutable Infrastructure (不可变基础设施)**:
   - 镜像构建 → 签名 → 金丝雀 → 滚动替换。严禁 `docker exec` / `kubectl exec` 直接修改生产容器。紧急例外必须经 Level C 授权，并在 24h 内以镜像固化回填主干。
3. **Physical Read/Write Isolation (读写凭证物理硬隔离)**:
   - 只读 token 仅出现在只读 context；写 token 仅在隔离沙箱按需注入。二者不同进程、不同挂载、不同审计流，绝不共存。
4. **Mandatory Dry-Run & Blast Radius Audit (强制 Dry-Run 与爆炸半径审计)**:
   - 所有生产状态变更必须先执行 `--dry-run` / `terraform plan`，输出资源级精准 diff（增删改精确计数），由自动化规则与双人核验后方可 apply。
5. **Infrastructure as Code (变更即代码)**:
   - 生产环境一切变更必须通过 Git 提交与自动化 CI/CD 流水线，严禁在控制台点选式修改产生配置漂移。
6. **Blameless Postmortem (无指责复盘文化)**:
   - 事故复盘的对象是系统架构的脆弱性、监控的盲区与应急 SOP 的缺陷，绝不归咎或追责个人。

---

## 2. 物理二级熔断 SOP (Physical Tiered Circuit Breaker)

### 级别 A — 只读探测 (Read-Only Telemetry, 默认常驻)
- **凭证**：只读 RBAC (get/list/watch)，无 secret 读取、无 exec、无 port-forward 写入能力。
- **工具链**：只读 k8s context, sentry-mcp, 只读 Docker API, k9s --readonly, 指标与日志收集。
- **执行层硬阻断**：执行层拦截器对拟执行命令做字符串 + AST 双检；命中 `rm -rf`, `mkfs`, `dd of=/dev/`, `DROP/TRUNCATE`, `kubectl delete ns|pvc`, `terraform destroy`, `litestream restore --force` 等，直接拒绝并记录安全审计，不存在人工确认绕过路径。

### 级别 B — 轻量回滚与自适应扩缩 (Automated Rollback & Scale)
- **允许动作**：回滚到 Last Known Good (LKG) 镜像、HPA/replicas 扩缩、流量权重调整、Feature Flag 降级开关。
- **金丝雀阶梯**：5% → 25% → 50% → 100%，每阶 bake ≥ 5 min。
- **自动秒级回退阈值 (< 60s 触发)**：
  - HTTP 5xx 率 > 1% 持续 2 min，或较基线绝对上升 > 1 个百分点；
  - 核心服务 P99 延迟 > 基线 1.5x 持续 3 min；
  - 错误预算燃烧率 (Error Budget Burn Rate) > 14.4x (1h 窗口) 或 > 6x (6h 窗口)；
  - 核心 SLI 饱和度或队列积压越限。
- **回退契约**：动作原子化、幂等、可重入；回退后自动冻结该版本分支并发出 P0 告警。

### 级别 C — 高危破坏性硬中断 (Destructive Hard Gate)
- **触发集**：PVC/PV 删除、Namespace 清空、数据库 DROP/TRUNCATE、对象存储批量删除、密钥重置、DNS 根记录切换、跨区域故障转移。
- **流程**：硬中断 → 生成机器可读《变更影响评估单》 → 人工二级授权（双人，其中一人非执行者） → 限时维护窗口执行 → 执行后指标校验。
- **评估单强制项**：资源清单与精确数量、依赖拓扑、数据备份与可恢复性验证证据（近期真实的 restore 演练记录，不接受口头已备份声明）、最大可容忍中断时长 (MTPD)、Dry-Run 精准 diff。

---

## 3. D0-D4 降级阶梯与自愈退避算法

- **D0 (正常全功能态)**：100% 流量放行，全量业务链路活跃。
- **D1 (性能降级态)**：关闭非核心后台任务（如异步日志归档、全文索引实时构建、非核心看板刷新）。
- **D2 (功能降级态)**：关闭次级业务特性（如评论推荐流、头像动画、第三方统计上报），保障核心交易与读写可用。
- **D3 (静态降级态)**：核心读接口降级为只读本地 Mini-Cache，写请求进入排队削峰队列或返回友好重试提示。
- **D4 (硬熔断隔离态)**：触发人工升级介入，系统切至冷备灾备静态页。
- **自愈退避算法**：Full-Jitter 算法（基础 200ms x 2 指数倍增，上限 30s 随机抖动），重试预算上限 10%，熔断触发窗口 30s 内连续 5 次失败即进入 Open 状态。
