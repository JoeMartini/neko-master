# Documentation Index

[中文](./README.zh.md) | **English**

## For Developers & AI Tools

- [AGENTS.md](../AGENTS.md) — single source of truth for coding conventions, key contracts, and the project map (Claude Code / Copilot entry files point here)
- [CONTRIBUTING.md](../CONTRIBUTING.md) — development workflow, PR requirements ([中文](../CONTRIBUTING.zh.md))
- [Skills](../.claude/skills/) — task-specific workflow guides: `verify-changes`, `add-stats-dimension`, `release`, `ui-conventions`, `db-conventions`, `agent-probe-dev`

## Architecture

- [System Architecture](./architecture.en.md) — end-to-end architecture, data flow, module design, ClickHouse integration
- [Release Checklist (Chinese)](./release-checklist.md) — version release steps

## Agent

- [Documentation Index](./agent/README.md) — Agent docs navigation
- [Overview](./agent/overview.en.md) — how it works, Direct vs Agent comparison, security model
- [Quick Start](./agent/quick-start.en.md) — end-to-end setup from UI to running agent
- [Install Guide](./agent/install.en.md) — script install, systemd / launchd / OpenWrt autostart
- [Configuration](./agent/config.en.md) — full flag reference and examples
- [Release Flow](./agent/release.en.md) — versioning conventions and CI/CD pipeline
- [Troubleshooting](./agent/troubleshooting.en.md) — common errors and fixes

## Research Reports

- [Kimi 2.5](./research/kimi2.5.en.md) / [中文](./research/kimi2.5.zh.md)
- [GPT-5.3](./research/GPT5.3.en.md) / [中文](./research/GPT5.3.zh.md)
- [GLM-5](./research/glm5.en.md) / [中文](./research/glm5.zh.md)

## Internal Development Docs

> Some operational and internal development docs are currently Chinese-only.
> Internal analysis and planning documents from development. Not intended for end users.

- [ClickHouse Dataflow Analysis](./dev/clickhouse-dataflow-analysis.md)
- [ClickHouse Dataflow Analysis Report](./dev/clickhouse-dataflow-analysis-report.md)
- [ClickHouse Migration I/O Analysis](./dev/clickhouse-migration-io-analysis.md)
- [ClickHouse Refactor Plan](./dev/clickhouse-refactor-plan.md)
- [ClickHouse Review Report](./dev/clickhouse-review-report.md)
- [refactor/clickhouse Branch Review](./dev/review-refactor-clickhouse-branch.md)
