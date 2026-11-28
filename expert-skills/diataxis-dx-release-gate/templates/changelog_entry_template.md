# Changelog 变更发布模板

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-11-17

### Added
- 新增项目调度员专属 `autonomous-dag-orchestrator` 自治调度技能库。
- 新增文档版本员专属 `diataxis-dx-release-gate` 契约发布技能库。

### Changed
- 全面优化全团队 DAG 任务拓扑图，启用两振出局 (Two-Strike) 死锁熔断。
- 升级 OpenAPI 契约对账流水线，支持 Schema 字段变更自动化静态比对。

### Deprecated
- 弃用旧版非结构化的口头 Task 描述文本，计划于 v2.0.0 彻底移除。

### Removed
- 移除遗留的单机未加锁的临时任务调度脚本。

### Fixed
- 修复了极端网络抖动下子进程会话无法自动触发垃圾回收 (GC) 的缺陷。

### Security
- 升级底层依赖至最新加固补丁版本，消灭已知高危脆弱性。
