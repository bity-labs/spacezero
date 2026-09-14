# Space Zero

> **⚠️ Development stopped.**
> Space Zero is no longer maintained or developed. See
> [Why I'm stopping Space Zero](https://www.tibyverse.xyz/articles/why-im-stopping-space-zero)
> for the full story.
>
> You're on the `v2` branch: the rebuild around the standalone Workspace Host,
> Desktop, and Client Runtime architecture — never released. The `main` branch
> contains **v0.1**, the original desktop application. Both branches are
> archived in source form.

The zero-friction workspace for agentic development.

## Stack

- Electron
- React
- TypeScript
- Vite via `electron-vite`
- SQLite via `better-sqlite3`
- Drizzle schema foundation
- Tailwind CSS + shadcn/ui-compatible structure
- Typed IPC through preload bridge
- Vitest + React Testing Library
- Playwright Electron smoke test

## Development

```bash
pnpm install
pnpm dev
```

## Quality checks

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
```

`pnpm test:e2e` builds the app, launches Electron through Playwright, and verifies the app shell, IPC bridge, and SQLite health check.

## Architecture

```txt
src/main      Electron main process: windows, IPC handlers, SQLite, future git/agents
src/preload   Safe typed bridge exposed to the renderer as window.spacezero
src/shared    Shared IPC channel names and TypeScript types
src/renderer  React app UI
```

The renderer does not get raw Node.js access. Desktop capabilities are exposed through explicit typed IPC methods only.
