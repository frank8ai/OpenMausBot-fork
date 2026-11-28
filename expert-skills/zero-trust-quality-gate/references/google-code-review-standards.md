# Google Engineering Practices (Code Review) 深度解构与内化标准

## 1. 代码评审的本质：Code Health 优于绝对完美

Google 代码审查的最高准则：
> "In general, reviewers should favor approving a CL once it is in a state where it definitely improves the overall code health of the system being worked on, even if the CL isn't perfect."

- **指导原则**：没有完美的代码，只有持续改善的代码库。评审人不应要求作者在单个 CL 内把代码重构成完美形态，只要该变更使系统代码健康度净增加，且不引入新的架构债务与安全隐患，即应予以放行。
- **导师角色而非守门关卡 (Mentorship over Gatekeeping)**：评审过程是工程实践传播的最佳窗口，应分享设计思维与前沿实践，而非居高临下的挑剔。

---

## 2. 小颗粒度变更铁律 (Small CLs Law)

Google 统计表明：小变更不仅审查速度快 3~5 倍，而且漏判缺陷的概率下降 70%。

- **黄金标准**：单次 CL 中位数 24 行，上限 200 行。
- **拆分逻辑**：
  1. **第一步：重构准备 (Refactor CL)**：提取公共类、移动目录或调整接口契约，不包含新功能业务逻辑。
  2. **第二步：核心实现 (Feature CL)**：基于新接口编写核心逻辑与单测用例。
  3. **第三步：装配启用 (Wiring CL)**：在入口处挂载调用、更新配置或切换路由。
- **收益**：变更爆炸半径（Blast Radius）可控，回滚时可秒级单步 revert，杜绝大规模回滚引发次生灾难。

---

## 3. 规避无谓琐事争论 (Eliminating Bikeshedding)

- **格式与排版零容忍**：代码格式（缩进、换行、括号风格、import 排序）100% 交由自动化工具（Biome/Ruff/Prettier）处理。如果工具没有报警，评审人严禁在评审中发表任何排版意见。
- **个人偏好与客观标准的界限**：当存在多种合理设计方案时，只要作者的方案符合项目统一规范且逻辑健全，评审人应遵从作者的选择，不可强加个人喜好。
- **标记轻微意见**：对于纯粹个人建议或未来优化思考，必须显式标注 `[NIT]`（Nitpick），并明确说明“非阻塞合并，作者可自行决定是否采纳”。

---

## 4. 评审响应时效与解阻哲学 (Speed & Unblocking)

- **1 个工作日内响应**：收到审查邀请后，必须在 24 小时内给出第一轮反馈；若无法立即深度审查，应告知预计完成时间。
- **避免多轮拉锯**：评审意见应一次性提全，避免每轮修改后又抛出全新问题。若连续 2 轮审查仍存在架构分歧，必须立即发起面对面/同步沟通，严禁在 Review 评论区展开无休止的文字拉锯。
