# Space Zero

Space Zero is a local-first desktop interface for directing Pi-powered coding agents. The active `v0.1` line is a clean rebuild around a standalone, remote-ready Workspace Host and a polished desktop client.

## Status

This repository now has the first executable initialization slice:

- pnpm `10.28.1` workspace pinned to Node.js `22.23.1`;
- strict ESM TypeScript configuration;
- minimal Electron/React Desktop shell with a narrow app-version preload boundary;
- independently runnable ordinary-Node Workspace Host lifecycle shell;
- empty browser-safe Host Contracts and Client Runtime package entrypoints with import smoke tests; and
- metadata/config-only Pi Adapter package with no Pi SDK dependency.

Deferred: Host protocol endpoints or metadata, authentication/capabilities, SQLite persistence, Projects, Sessions, Git/worktrees, Pi implementation, private-Node release packaging, Handbook, shared UI package, Storybook, Nx, and Turborepo.

## Commands

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
pnpm clean
```

Use focused filters for individual workspaces, for example `pnpm --filter @spacezero/workspace-host build`.

## Workspace shape

```text
apps/
  desktop/          Electron shell and first Space Zero client
  workspace-host/   Headless ordinary-Node workspace host shell
  handbook/         Inactive README placeholder
packages/
  host-contracts/   Empty browser-safe package entrypoint for future contracts
  client-runtime/   Empty browser-safe package entrypoint for future client runtime
  pi-adapter/       Metadata/config/test setup only; no Pi SDK yet
  ui/               Inactive README placeholder
scripts/            Repository automation and boundary checks
```

## Documentation

- `docs/` is the normative source of truth for agents and engineering work.
- `.agents/` contains reusable agent workflows.
- `AGENTS.md` defines repository navigation and working rules.
