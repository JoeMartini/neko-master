# 为 Neko Master 做贡献

[English](./CONTRIBUTING.md) | **中文**

感谢你的贡献！本文面向人类开发者；如果你使用 AI 编码工具（Claude Code、Copilot、Cursor、Codex 等）开发，请让它先读 [AGENTS.md](./AGENTS.md)——完整的规范、关键契约和任务级流程指南（[`.claude/skills/`](./.claude/skills/)）都在那里。

## 开发环境

- Node.js 22、pnpm；只有改 `apps/agent` 才需要 Go 1.22+。

```bash
pnpm install
pnpm dev            # 启动 web (3000) + collector (3001/3002)
```

Monorepo 结构：`apps/web`（Next.js 前端）、`apps/collector`（Fastify + SQLite 后端）、`apps/agent`（Go 探针）、`packages/shared`（共享类型）。

## 提 PR 之前

按改动范围运行检查（详见 [`verify-changes` skill](./.claude/skills/verify-changes/SKILL.md)）：

```bash
pnpm --filter @neko-master/collector exec tsc --noEmit
pnpm --filter @neko-master/collector test
pnpm --filter @neko-master/web exec tsc --noEmit
pnpm --filter @neko-master/web exec next build     # 影响生产构建的前端改动
cd apps/agent && go vet ./... && go test ./...      # 探针改动
```

要求：

- **测试**：后端新行为需要 Vitest 用例（测试工具见 `apps/collector/src/__tests__/helpers.ts`）。
- **i18n**：所有面向用户的文案走 `next-intl`，key 必须同时加进 `apps/web/messages/zh.json` 和 `en.json`。
- **暗色模式**：每个视觉改动都要在两种主题下检查——只写亮色 Tailwind class 是最高频的 review 意见。
- **schema / 统计改动**：按 [`add-stats-dimension`](./.claude/skills/add-stats-dimension/SKILL.md) 清单执行——多处注册点必须同步修改。
- **新增环境变量**：必须写进 `.env.example`。

## Commit 与 PR

- 约定式提交：`fix(collector): ...`、`feat(web): ...`、`docs: ...`。
- PR 保持聚焦；说明用户可见的效果和你的验证方式。
- 代码标识符、注释、commit message 一律英文；有 `.zh.md` 对应文件的文档保持双语。

## 发版（维护者）

由 tag 驱动：`vX.Y.Z` 构建 Docker 镜像，`agent-vX.Y.Z` 构建探针二进制。完整流程见 [`release` skill](./.claude/skills/release/SKILL.md) 与 [docs/release-checklist.md](./docs/release-checklist.md)。

## 反馈问题

使用 issue 模板；请附上部署方式（Docker/compose）、版本号、网关类型（mihomo/Surge/OpenClash）和相关 collector 日志。
