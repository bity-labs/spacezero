# Space Zero

Space Zero is a local-first desktop interface for directing Pi-powered coding agents. The active `v0.1` line is a clean rebuild around a standalone, remote-ready Workspace Host and a polished desktop client.

## Status

This repository now includes the v0.1 Workspace Host foundation:

- pnpm `10.28.1` workspace pinned to Node.js `22.23.1`;
- strict ESM TypeScript configuration;
- secure Electron/React Desktop with a standard `spacezero://renderer` origin;
- protected inherited-pipe bootstrap and Desktop-owned Local Host lifecycle with bounded crash restart/backoff;
- Host-instance supervisor and short-lived scoped client capabilities;
- Effect HttpApi query and authenticated typed SSE connectivity through Client Runtime;
- Host-owned SQLite Project catalog with canonical Git repository registration/listing;
- Host-owned Project Session create/list/prompt/message/event APIs with event-sourced Session state, permanent normalized wine-appellation names, managed Git worktrees under Space Zero Home, replayable Session SSE cursors, and one durable Pi conversation identity per Session;
- `harness-auth` provider status/API-key commands backed by Host-private Pi credential storage; and
- Pi Adapter execution through the Pi SDK with restored Session history and bounded read/write/edit file tools rooted at the authenticated managed worktree;
- private Fumadocs Handbook for human build memory; and
- active `@spacezero/ui` package with shadcn-compatible primitives, official theme tokens, and package-local Storybook.

Packaged Host launch remains fail-closed until private Node and integrity packaging are implemented. Also deferred: archive/delete, source selection, GitHub/remotes, full Workspace Tool registry and approval policy, OAuth login flows, and packaged private-Node release hardening.

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
  handbook/         Private Fumadocs handbook
packages/
  host-contracts/   Browser-safe Host Protocol schemas and HttpApi declarations
  client-runtime/   Browser-safe authenticated query/SSE client
  pi-adapter/       Host-side Pi SDK runner, provider auth storage, and bounded file tools
  ui/               Browser-safe React UI primitives, theme tokens, and Storybook
scripts/            Repository automation and boundary checks
```

## Documentation

- `docs/` is the normative source of truth for agents and engineering work.
- `.agents/` contains reusable agent workflows.
- `AGENTS.md` defines repository navigation and working rules.
