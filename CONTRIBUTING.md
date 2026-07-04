# Contributing to Neko Master

**English** | [中文](./CONTRIBUTING.zh.md)

Thanks for contributing! This guide covers the development workflow for humans; if you develop with an AI coding tool (Claude Code, Copilot, Cursor, Codex, ...), point it at [AGENTS.md](./AGENTS.md) — it holds the full conventions, key contracts, and task-specific workflow guides ([`.claude/skills/`](./.claude/skills/)).

## Development setup

- Node.js 22, pnpm; Go 1.22+ only if you touch `apps/agent`.

```bash
pnpm install
pnpm dev            # starts web (3000) + collector (3001/3002)
```

Monorepo layout: `apps/web` (Next.js frontend), `apps/collector` (Fastify + SQLite backend), `apps/agent` (Go probe), `packages/shared` (shared types).

## Before you open a PR

Run the checks for the areas you touched (details: [`verify-changes` skill](./.claude/skills/verify-changes/SKILL.md)):

```bash
pnpm --filter @neko-master/collector exec tsc --noEmit
pnpm --filter @neko-master/collector test
pnpm --filter @neko-master/web exec tsc --noEmit
pnpm --filter @neko-master/web exec next build     # for production-impacting web changes
cd apps/agent && go vet ./... && go test ./...      # for agent changes
```

Requirements:

- **Tests**: new backend behavior needs a Vitest case (helpers in `apps/collector/src/__tests__/helpers.ts`).
- **i18n**: user-facing strings go through `next-intl` with keys in BOTH `apps/web/messages/zh.json` and `en.json`.
- **Dark mode**: check every visual change in both themes — light-only Tailwind classes are the most common review comment.
- **Schema/stats changes**: follow the [`add-stats-dimension`](./.claude/skills/add-stats-dimension/SKILL.md) checklist — several registries must change together.
- **New env vars**: document them in `.env.example`.

## Commits and PRs

- Conventional-commit style: `fix(collector): ...`, `feat(web): ...`, `docs: ...`.
- Keep PRs focused; explain the user-visible effect and how you verified it.
- English for code identifiers, comments, and commit messages; docs are bilingual where a `.zh.md` counterpart exists.

## Releases (maintainers)

Tag-driven: `vX.Y.Z` builds Docker images, `agent-vX.Y.Z` builds agent binaries. Full flow: [`release` skill](./.claude/skills/release/SKILL.md) and [docs/release-checklist.md](./docs/release-checklist.md).

## Reporting issues

Use the issue templates; include your deployment method (Docker/compose), version, gateway type (mihomo/Surge/OpenClash), and relevant collector logs.
