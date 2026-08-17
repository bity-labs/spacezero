# Space Zero

Space Zero is a local-first desktop interface for directing Pi-powered coding agents. The active `v0.1` line is a clean rebuild around a standalone, remote-ready Workspace Host and a polished desktop client.

## Status

This repository now includes the authenticated Local Host connectivity tracer and initial Host-owned Project catalog:

- pnpm `10.28.1` workspace pinned to Node.js `22.23.1`;
- strict ESM TypeScript configuration;
- secure Electron/React Desktop with a standard `spacezero://renderer` origin;
- protected inherited-pipe bootstrap and Desktop-owned Local Host lifecycle;
- Host-instance supervisor and short-lived scoped client capabilities;
- Effect HttpApi query and authenticated typed SSE connectivity through Client Runtime;
- Host-owned SQLite Project catalog with canonical Git repository registration/listing; and
- metadata/config-only Pi Adapter with no Pi SDK dependency.

Packaged Host launch remains fail-closed until private Node and integrity packaging are implemented. Also deferred: crash restart/backoff, durable SSE replay/reconnect, Project Sessions, managed worktrees, Pi implementation, Handbook, shared UI, and Storybook.

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
  desktop/          Electron client and Local Host supervisor
  workspace-host/   Headless authenticated Effect Workspace Host
  handbook/         Inactive README placeholder
packages/
  host-contracts/   Browser-safe Host Protocol schemas and HttpApi declarations
  client-runtime/   Browser-safe authenticated query/SSE client
  pi-adapter/       Metadata/config/test setup only; no Pi SDK yet
  ui/               Inactive README placeholder
scripts/            Repository automation and boundary checks
```

## Documentation

- `docs/` is the normative source of truth for agents and engineering work.
- `.agents/` contains reusable agent workflows.
- `AGENTS.md` defines repository navigation and working rules.
