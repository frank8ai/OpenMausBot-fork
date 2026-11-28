# Autofabric Studio v5.1 Apex 全景技术规格与集成手册

## 1. 架构定位与设计哲学
- **规范标准**: W3C Design Tokens Community Group (DTCG) 三层 Token 契约 (Global -> Semantic -> Component)。
- **物理动力学**: RK4 (四阶龙格-库塔) 阻尼简谐振子连续弹簧物理引擎，交互可随时物理打断并无损继承瞬时初速度矢量。
- **布局位移控制**: 1:1 等高骨架屏与占位保护，严格实现 $CLS = 0.000$。
- **推测性零延迟**: 光标锥体预测 + 0ms 双模式零摩擦切换胶囊。

## 2. 核心模块组成
1. **三域总控全景矩阵 (3-Domain Portfolio Matrix)**:
   - **Infra (基础保障)**: OpenMausBot Core Daemon, SheerID-Bypass 等底层容器健康监控。
   - **Fulfill (履约服务)**: FetchInbox (fetchinbox.com) 等业务自动化履约中台。
   - **App (应用孵化)**: Aer-Runtime 等下一代轻量沙箱微内核应用。
   - 全局 CPU 负载、物理常驻内存 (RSS)、水温指数与任务归档计数实时展示。
2. **待审批与高危签发 (Action Inbox)**:
   - **SheerID 熔断卡**: 遇到设备指纹与反爬拦截，一键原地调出 60 FPS 沙箱屏幕或直接接管。
   - **FetchInbox 凭据卡**: 行内安全注入 API Token，杜绝弹窗打扰与上下文丢失。
   - **Aer-Runtime 低风险卡**: 1 键安全采纳，附带 5 秒支持后悔撤销 (Undo) 的确定性安全气囊。
3. **对话核心 12 项高频微交互 (Battle-Tested Chat Core)**:
   - 实时执行流水线折叠轴 (Live Steps)。
   - 消息置顶 (Pin) 与 Fork 分支分叉。
   - 上下文水位微环与 Token 消耗指示。
   - `/` 快捷斜杠指令与 `@` 智能体快速协同选择器。
4. **五维核查抽屉 (5-Tab Inspector Drawer)**:
   - **屏幕 (Screen)**: 实时虚拟机沙箱画面与截图快照。
   - **文件 (Files)**: 项目交付资产列表与尺寸审计。
   - **数据 (Data)**: CPU、内存、API 燃烧率与渲染卡顿 (Jank) 物理指标。
   - **例行 (Routine)**: 心跳探测与凭证热监视器。
   - **证明 (Proof)**: 物理分支纯净度核验证明 (PR #6654 污染清退确认与备份仓归档凭证)。

## 3. 双模切流架构与零污染原则
- **上游保护**: 严禁将总控台注入代码推送至 `milind-soni/OpenMausBot` 上游仓库。
- **独立分支**: 所有代码资产归档在 `frank8ai/openmausbot-backup` 的 `feat/autofabric-studio-v5` 分支。
- **客户端热切换**: 在 OpenMausBot 左侧侧边栏挂载 `[经典 Bot 流] [✦ 工厂总控台]` 胶囊，按 `Esc` 键或点击胶囊即可在 0ms 内无感切换，零阻尼、零白屏。
