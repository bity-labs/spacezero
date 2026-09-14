# Space Zero

> # ⚠️ Development stopped — Space Zero is archived
>
> **Space Zero is no longer maintained or developed.** Read
> **[Why I'm stopping Space Zero](https://www.tibyverse.xyz/articles/why-im-stopping-space-zero)**
> for the full story: why a working first version was shelved in favor of a
> rebuild that couldn't be finished at 15 hours a week.
>
> Nothing is being shipped — no releases, no updates, no issue triage. The code
> is MIT-licensed and useful as reference material, nothing more. Keep that in
> mind before forking or depending on it.
>
> The repository lives in **two lines**, on two branches:
>
> | Branch | Version | What it is |
> |---|---|---|
> | **`main`** | v0.1 | The original desktop application |
> | **`v2`** | v2 (unreleased) | The rebuild, abandoned mid-flight |
>
> ### `main` — v0.1, the original desktop app
>
> A single-process Electron application. Electron main owns app lifecycle,
> windows, IPC handlers, and SQLite; a typed preload bridge (`window.spacezero`)
> is the only surface the renderer sees; React runs the workspace UI. Agent
> execution runs in an Electron utility process through the Pi SDK, with agent
> sessions and definitions, skills, a knowledge base with its own chat, a file
> explorer + editor, an embedded live browser, a terminal, GitHub
> issues/PRs integration, and multi-workspace project sessions wired into one
> desktop surface. Persistence is local-first SQLite via Drizzle. Shipped as
> signed, notarized, auto-updating macOS betas.
>
> In short: a working, fairly complete, local desktop workspace for agentic
> coding — shipped too fast to be reliable, which is why this version
> got archived with the product.
>
> ### `v2` — the rebuild (never released)
>
> A complete architectural rework of v0.1, splitting the monolithic Electron
> main process into three independently-testable layers:
>
> - **Workspace Host** — a headless, standalone process (Effect + TypeScript,
>   not Electron main) that owns projects, agent sessions, Pi execution,
>   managed Git worktrees, and durable event-sourced session state in its own
>   SQLite database, exposed over an authenticated Effect HttpApi protocol with
>   typed SSE event streams, replayable cursors, and reconnection semantics.
> - **Desktop** — the Electron client. Presents the interface, handles native
>   integration, and manages the local host's process lifecycle. It
>   deliberately no longer owns session execution.
> - **Client Runtime** — a UI-agnostic client layer speaking to the host:
>   authenticated queries, streamed events, caught-up state restore.
>
> The point of this split was **remote execution**: the same host
> implementation and protocol would serve a local machine and a remote host
> alike (agent and files on the remote side, the desktop acting as its
> supervised interface). Local-first still, but cloud-capable from the start
> rather than bolted on later. The local host foundation worked — projects,
> sessions, Pi conversations, worktrees, capability-based auth, event-sourced
> state — but the user-facing product was still under reconstruction when
> development stopped.

> You're on the `main` branch: v0.1, the original desktop application. The `v2`
> branch contains the rebuild. Both branches are archived in source form.

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
