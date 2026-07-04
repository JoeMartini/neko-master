# 文档索引

**中文** | [English](./README.md)

## 开发者与 AI 工具

- [AGENTS.md](../AGENTS.md) — 编码规范、关键契约与项目地图的唯一事实源（Claude Code / Copilot 入口文件均指向它）
- [CONTRIBUTING.zh.md](../CONTRIBUTING.zh.md) — 开发流程与 PR 要求（[English](../CONTRIBUTING.md)）
- [Skills](../.claude/skills/) — 任务级流程指南：`verify-changes`、`add-stats-dimension`、`release`、`ui-conventions`、`db-conventions`、`agent-probe-dev`

## 架构

- [系统架构](./architecture.md) — 端到端架构、数据流、模块设计、ClickHouse 集成
- [发布清单](./release-checklist.md) — 版本发布操作步骤

## Agent

- [文档总览](./agent/README.zh.md) — Agent 文档导航
- [架构说明](./agent/overview.md) — 工作原理、直连 vs Agent 模式对比、安全模型
- [快速开始](./agent/quick-start.md) — 从 UI 到运行的完整步骤
- [安装指南](./agent/install.md) — 脚本安装、systemd / launchd / OpenWrt 开机自启
- [参数配置](./agent/config.md) — 完整运行时参数列表与示例
- [发布流程](./agent/release.md) — 版本命名规范与 CI/CD 流程
- [常见问题](./agent/troubleshooting.md) — 常见错误与解决方法

## 研究报告

- [Kimi 2.5](./research/kimi2.5.zh.md) / [English](./research/kimi2.5.en.md)
- [GPT-5.3](./research/GPT5.3.zh.md) / [English](./research/GPT5.3.en.md)
- [GLM-5](./research/glm5.zh.md) / [English](./research/glm5.en.md)

## 内部开发文档

> 以下为开发过程中的内部分析与计划文档，不面向最终用户。

- [ClickHouse 数据流分析](./dev/clickhouse-dataflow-analysis.md)
- [ClickHouse 数据流分析报告](./dev/clickhouse-dataflow-analysis-report.md)
- [ClickHouse 迁移 I/O 分析](./dev/clickhouse-migration-io-analysis.md)
- [ClickHouse 重构计划](./dev/clickhouse-refactor-plan.md)
- [ClickHouse 评审报告](./dev/clickhouse-review-report.md)
- [refactor/clickhouse 分支评审](./dev/review-refactor-clickhouse-branch.md)
