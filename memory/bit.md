---
title: bit
aliases: [provider, 服务商, API gateway, Gemini channel, codex2api, Gemini 3.8 Flash, Antigravity 账号池, 429 配额耗尽, MausBot 网关]
---

- 2026-11-12 · from chat "Problems to look at" (noticed) · The person uses the bit service provider (bit) as a model/API provider.
- 2026-11-12 · from chat "Problems to look at" (noticed) · Direct testing of the bit Gemini channel found that gemini-3.8-flash returns normally in non-streaming mode (HTTP 200, about 9 seconds) but never returns a first byte when streaming, while gemini-3.7-flash streaming fails in 0.8 seconds with HTTP 400 model_not_found.
- 2026-11-12 · from chat "Problems to look at" (noticed) · 实测 Gemini 3.8 Flash 直连 codex2api 的流式请求正常（3.1–4.5 秒出字），经 bit 的 chat 接口 55 秒仍不返回第一个字节、responses 接口直接挂住，故障点在 bit 转发到上游这一段。
- 2026-11-12 · from chat "Problems to look at" (noticed) · codex2api 只发布 5 个 Gemini 模型名称（3.8-flash、3-flash、3.5-flash-lite、3.1-flash-lite、4-argon），而 bit 对外列出 3.7、3.8-high 等更多模型，请求落到没有真实渠道的模型上就返回 unknown provider / model_not_found 的 400。
- 2026-11-12 · from chat "Problems to look at" (noticed) · bit 网关（new-api）把 Gemini 通道的限流重试策略从“限流后立即换账号、只重试 1 次、间隔 0 毫秒”改为“重试 3 次、每次间隔 1.2 秒”，并已写入数据库，因此重启后不会丢失。
- 2026-11-12 · from chat "Problems to look at" · MausBot 的 Gemini 3.8 Flash 走 codex2api 网关（la-server 上的 Docker 服务），与 bit 网关共用同一批 Google Antigravity 账号池；上游 429 表示账号 5 小时配额耗尽，而非网关或 Key 故障。
- 2026-11-16 · from chat "你好，你是什么模型" (noticed) · The person decided that integrating Antigravity Tools must not use reverse proxy models due to risk control, and must automatically switch to the next account when quota is exhausted.
- 2026-11-17 · from chat "你好，你是什么模型" (noticed) · The person decided to use 路径 B（底层独立沙盒）：为每个机器人派生独立的凭证目录.
