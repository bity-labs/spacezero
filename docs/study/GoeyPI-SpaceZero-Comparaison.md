# Architecture Comparison: Space Zero vs GooeyPi

## Executive Verdict

**Space Zero has the stronger long-term product and code organization. GooeyPi currently has the stronger Electron security hardening and release discipline.**

In simplified terms:

- **Space Zero** is architected as an owned builder workspace platform.
- **GooeyPi** is architected as a mature multi-harness desktop client.

Space Zero’s architecture scales better by product feature, but it currently has one serious Electron security gap that GooeyPi already solves.

| Area | Space Zero | GooeyPi |
|---|---:|---:|
| Product/domain architecture | **9/10** | 6.5/10 |
| Code modularity | **8/10** | 6/10 |
| Agent integration design | **8.5/10** | 8/10 |
| Electron security today | 6.5/10 | **9/10** |
| Persistence model | **8.5/10** | 7.5/10 |
| Browser architecture | **8/10** | 7/10 |
| Terminal architecture | 7.5/10 | **8/10** |
| Renderer scalability | **7.5/10** | 6/10 |
| Testing strategy | 7/10 | **8/10** |
| Release maturity | 6/10 | **9/10** |
| Overall current architecture | **7.8/10** | **7.8/10** |
| Long-term potential | **Higher** | Mature but increasingly centralized |

## 1. Product Architecture

### Space Zero is stronger

Space Zero models product concepts explicitly:

- Projects
- managed Project Session worktrees
- stable Workspace Contexts
- rotatable Chat Contexts
- Global Chat
- Knowledge Base
- Side Pane tabs
- GitHub Issue/PR source identity
- Workspace Tools
- App Commands

These concepts are documented and represented in SQLite and feature services.

GooeyPi’s model remains closer to its external harnesses:

- projects are primarily access grants
- sessions remain harness-owned JSONL
- each harness owns its own session vocabulary
- the desktop app adapts Prime, OMP, and Pi into a shared interface

That is appropriate for GooeyPi, but Space Zero has the better foundation for the full **task-to-ship workspace** product.

### Important architectural difference

Space Zero deliberately owns the workspace layer while treating Pi as an implementation detail. GooeyPi deliberately leaves more ownership with its harnesses.

Space Zero should not copy GooeyPi’s multi-harness architecture without a new product decision. It would add substantial complexity before proving a need.

## 2. Source Organization and Maintainability

### Space Zero is substantially better organized

Space Zero uses process-aware feature modules:

```text
src/features/{feature}/
├── main/
├── renderer/
└── shared/
```

This gives projects, sessions, browser, files, terminal, GitHub, agents, settings, and knowledge explicit ownership.

Its main entrypoint is only:

- `src/main/index.ts` — 166 lines
- `src/renderer/src/App.tsx` — 34 lines

GooeyPi has larger global composition points:

- `electron/main/index.ts` — 1,088 lines
- `src/App.tsx` — 547 lines
- `src/hooks/useWorkspaceActions.ts` — 620 lines
- `src/hooks/useWorkspaceRuntime.ts` — 588 lines

GooeyPi’s harness adapter is excellent, but most application composition still converges in its main bootstrap and React root.

### Space Zero still has hotspots

Feature modules have not eliminated large coordinators:

- `src/renderer/src/workspace-shell.tsx` — 1,016 lines
- `src/features/files/renderer/components/files-tool.tsx` — 1,965 lines
- `src/features/files/renderer/files-store.ts` — 1,140 lines

Space Zero’s direction is better, but complexity has accumulated inside several feature containers. These should be decomposed by workflow ownership when touched—not split merely to reduce line counts.

## 3. Critical Electron Security Comparison

### GooeyPi is decisively stronger today

Space Zero correctly enables:

```ts
sandbox: true
contextIsolation: true
nodeIntegration: false
```

It also has a narrow typed preload API and generally validates payloads with Zod.

However, it does **not currently bind privileged IPC to the trusted renderer**.

`src/main/index.ts` does not prevent or revoke:

- main-frame navigation
- redirects
- untrusted frame navigation

Feature IPC handlers register directly with `ipcMain.handle()` and do not centrally verify:

- authorized `WebContents`
- exact renderer URL
- `senderFrame`
- main-frame identity

Therefore, if the privileged window navigated to remote content, that content could inherit the Space Zero preload and call powerful APIs for files, terminals, GitHub, agents, credentials, and updates.

GooeyPi already provides the correct pattern:

- exact trusted renderer URL
- explicit authorized `WebContents` registry
- main-frame-only IPC
- navigation and redirect denial
- authorization revocation
- authorization checks on outbound events

### This is Space Zero’s highest-priority issue

It should be fixed before another public release.

A central wrapper should enforce authorization for every handler rather than requiring every feature to remember it.

## 4. Electron Packaging Hardening

### GooeyPi is stronger

GooeyPi flips Electron fuses to disable:

- RunAsNode
- `NODE_OPTIONS`
- debug CLI arguments
- non-ASAR application loading
- unvalidated ASAR
- extra `file://` privileges

Space Zero currently has no equivalent `afterPack` fuse hardening.

Space Zero’s macOS signing and notarization workflow is good, but signing a package is not the same as hardening Electron’s runtime configuration.

Space Zero should adopt fuse configuration and verification similar to GooeyPi.

## 5. Agent Integration

### Different strengths

#### Space Zero

Space Zero embeds the Pi SDK inside an Electron utility process:

```text
Renderer
  → typed IPC
Main
  → MessagePort
Utility process
  → Pi SDK
```

Advantages:

- Pi work stays off Electron’s main thread.
- Main remains the app capability authority.
- Workspace Tools share application services with human UI flows.
- Tool safety levels and confirmation are first-class.
- Project tools and app tools have clearly separated authority.

This is a cleaner first-party agent architecture.

#### GooeyPi

GooeyPi launches three CLI harnesses as child RPC processes and normalizes them through `HarnessRpcAdapter`.

Advantages:

- strong harness independence
- better resilience against external CLI differences
- robust RPC correlation and transport limits
- users retain harness-owned sessions and credentials
- easier support for multiple harness versions

### Where Space Zero is weaker

The main-to-utility protocol is largely trusted through TypeScript casts. It lacks GooeyPi-style runtime safeguards for:

- frame size
- event rate
- pending request count
- aggregate streamed bytes
- schema validation
- capability claims
- command/response correlation

Space Zero should retain its SDK/utility architecture but adopt GooeyPi’s bounded transport discipline.

## 6. Browser Architecture

### Space Zero has the better primitive

Space Zero uses main-owned `WebContentsView` instances. GooeyPi enables renderer-hosted `<webview>`.

Space Zero’s approach is more aligned with modern Electron architecture:

- main owns browser lifecycle
- remote content never gets the app preload
- renderer receives opaque IDs
- browser views are context-authorized
- renderer cannot select arbitrary partitions or `WebContents`

This was the correct decision.

### GooeyPi has stronger operational policy

GooeyPi currently does better at:

- rejecting credential-bearing URLs
- download size limits
- download concurrency limits
- hourly download budgets
- gesture requirements
- owner-destruction cancellation
- agent browser action rate limits
- session-scoped agent browser authority

Space Zero’s browser is builder-operated and does not yet expose Workspace Tools. When agent browser control is added, it should combine:

- Space Zero’s `WebContentsView`
- Space Zero’s Workspace Tool safety policy
- GooeyPi’s capability scoping and resource limits

## 7. Terminal Architecture

Both correctly use main-owned `node-pty` with opaque renderer IDs.

### Space Zero is stronger at workspace continuity

- Terminal tabs belong to stable contexts.
- Tab topology and validated working directories persist.
- PTYs continue when switching views.
- Tabs restore as fresh shells after restart.
- Context ownership and managed-worktree roots are explicit.

### GooeyPi is stronger against resource exhaustion

GooeyPi adds:

- eight-terminal global cap
- output coalescing
- output throughput limits
- flood termination
- bounded renderer transport

Space Zero bounds retained scrollback, but forwards each PTY chunk immediately and does not cap live terminals. Retention bounds do not prevent IPC flooding.

Space Zero should add transport admission and coalescing independently of scrollback retention.

## 8. Persistence

### Space Zero has the better data model

SQLite with WAL, foreign keys, repositories, and relational ownership is a better fit for:

- projects
- sessions
- chat contexts
- worktrees
- GitHub sources
- browser tabs
- terminal tabs
- settings

GooeyPi’s JSON state is less suitable for a product-owned workspace graph.

### GooeyPi has stronger migration mechanics

GooeyPi’s JSON persistence includes:

- explicit state versions
- maximum file size
- newer-version fail-closed handling
- atomic publication
- filesystem syncing
- detailed POSIX/Windows migration recovery

Space Zero currently uses conditional SQLite schema changes without a rigorous schema-version migration system.

Space Zero should keep SQLite, but introduce:

- numbered migrations
- transactions
- explicit schema version
- newer-version detection
- migration backup/recovery policy

## 9. Renderer Architecture

Space Zero has better separation:

- TanStack Router
- TanStack Query for external server state
- Zustand for renderer UI state
- pure view/container direction
- Storybook fixtures and stories
- feature-specific renderer modules

GooeyPi has a leaner dependency footprint and effective generation-based stale-result protection, but too much application state still converges in `App` and large hooks.

One specific GooeyPi technique worth preserving is its disciplined transcript reconciliation:

- optimistic renderer rows
- streaming events
- authoritative transcript reads
- generation-aware stale result rejection

Space Zero’s agent projection sequencer addresses similar problems, but GooeyPi is useful reference material for long-running event reconciliation.

## 10. Testing and Release Maturity

### Space Zero has more tests, but GooeyPi has stronger governance

Current repository size:

| | Space Zero | GooeyPi |
|---|---:|---:|
| Tracked files | 838 | 411 |
| TypeScript/TSX | ~133k lines | ~62k lines |
| Test files | 215 | ~132 |

Space Zero has excellent feature-local unit, service, repository, renderer, Storybook, and Electron E2E coverage.

However, the current full test run reported failures in terminal ordering tests and App canvas setup, and did not terminate cleanly. There are also no enforced coverage thresholds.

GooeyPi has stronger automated gates:

- coverage thresholds
- lint and formatting
- hermetic Electron E2E
- cross-platform package smoke tests
- dependency audit
- bundle-size budgets
- artifact verification
- checksums
- provenance attestations
- release gating on successful validation

Space Zero’s macOS release workflow currently builds and signs but does not appear to gate publication on the complete lint/unit/E2E suite.

## Recommended Priorities for Space Zero

### Before another public release

1. **Add trusted-renderer navigation and IPC sender authorization.**
2. **Add Electron fuse hardening and package verification.**
3. **Make the full test suite green and release-blocking.**
4. **Add terminal output coalescing and resource caps.**

### Next

5. Runtime-validate and bound the main-to-utility protocol.
6. Introduce versioned transactional SQLite migrations.
7. Harden browser URLs and downloads.
8. Include active agent runs in quit confirmation and graceful shutdown.
9. Mechanically enforce runtime import boundaries through ESLint.
10. Split `WorkspaceShell` and Files around cohesive workflows.

## What Space Zero Should Not Copy from GooeyPi

- Do not add multi-harness support without a product decision.
- Do not replace SQLite with JSON state.
- Do not replace `WebContentsView` with `<webview>`.
- Do not centralize feature behavior back into `main/index.ts`.
- Do not expose browser automation without Workspace Tool safety policy.

## Bottom Line

**Space Zero has the better architecture for the product it wants to become.** Its feature ownership, utility-process Pi integration, Workspace Tool control plane, relational domain model, managed worktrees, and context-scoped workspace model are stronger foundations than GooeyPi’s harness-centric architecture.

**GooeyPi is currently safer and more operationally mature as a shipped Electron application.** Space Zero should adopt its renderer-origin authorization, transport bounding, resource controls, packaging hardening, and release gates while preserving Space Zero’s existing product architecture.

## Study Session

Pi session ID: `01a006b4-c4ac-736a-829e-ceb5326bd324`
