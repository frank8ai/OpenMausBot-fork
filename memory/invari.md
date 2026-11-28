---
title: invari
aliases: [Invari, 跨域电商, 客户服务编排网关, order context, fulfillment, widget, Phase 35-B, timeline, 容器化, staging, canary, Shopify Webhook]
---

- 2026-11-13 · from chat "检查这个项目的任务状态以及任务完成情况，并给下一步的计划；" (noticed) · Invari 项目已推进至 Phase 34（Order Context & Fulfillment Timeline Aggregator），Phase 34 与 Phase 35-A（后端端点暴露）均已全面交付完成，基线契约 571/571 PASS，单测 388 passed。
- 2026-11-13 · from chat "检查这个项目的任务状态以及任务完成情况，并给下一步的计划；" (noticed) · Invari 项目 Phase 35-B（前端 Widget 履约时间线渲染）当前处于进行中（Pending）状态，widget.js 尚未完成对订单上下文 API 返回数据的 Timeline 富文本结构化卡片渲染。
- 2026-11-13 · from chat "检查这个项目的任务状态以及任务完成情况，并给下一步的计划；" (noticed) · Invari 项目当前处于从原型到高可用生产闭环（Phase 30–Phase 35）的深水区，已具备生产容器化试运行与灰度部署条件（Production-Ready for Staging & Canary）。
- 2026-11-13 · from chat "检查这个项目的任务状态以及任务完成情况，并给下一步的计划；" (noticed) · The person decided that MausBot should autonomously choose whether to generate developer prompts itself or delegate to the prompt architect ('提示词架构师'), based on its own judgment.
- 2026-11-13 · from chat "检查这个项目的任务状态以及任务完成情况，并给下一步的计划；" (noticed) · The person's workflow for Invari development: after the development engineer completes tasks, Gemini 4 expert sub-agent performs acceptance review, then Gemini 4 generates the new plan and prompts.
- 2026-11-14 · from chat "检查这个项目的任务状态以及任务完成情况，并给下一步的计划；" (noticed) · Invari 项目 Phase 36（Shopify Webhook 多包裹同步与 DLQ，PR #20，commit b30dc3b）和 Phase 37（Chatwoot Action Proposals 与多租户 HMAC，PR #21，commit ef00d2c）均已合入 main 分支，571/571 基线门禁全通过，435/435 自动化测试全通过，GitHub Actions CI 全绿，工作树干净。
- 2026-11-15 · from chat "检查这个项目的任务状态以及任务完成情况，并给下一步的计划；" (noticed) · The person enforces that specialized expert Bots (代码评审员, 测试质保员) must perform independent review work in visible, verifiable threads — not be claimed as running without evidence.
- 2026-11-15 · from chat "检查这个项目的任务状态以及任务完成情况，并给下一步的计划；" · Invari PR-10 (Phase 39) 影子计量与归因冲正引擎已合入 main 分支（PR #23，commit 43a7549），全量 451 项测试绿灯，包含 72h 归因静默期、7天 Reopen 冲正及 billable: false 不可变防篡改门禁。
- 2026-11-15 · from chat "检查这个项目的任务状态以及任务完成情况，并给下一步的计划；" · Invari PR-11（商家多租户看板与影子计量 ROI 归因数据流）已完成专家开发、代码评审员与测试质保员双核终审，456 项全量测试全绿（456/456 PASS），已通过 PR #24 Squash-merged 合并入 main 分支（Commit 9b3e53a）。
- 2026-11-15 · from chat "检查这个项目的任务状态以及任务完成情况，并给下一步的计划；" · Invari PR-12（商家后台轻量数据看板与工单实时状态视图）已完成全栈开发落地、代码评审员与测试质保员双核终审，462项全量测试全绿（462/462 PASS），已通过 PR #25 Squash-merged 合并入 main 分支（Commit 984ffe8）。
