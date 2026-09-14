# Architecture Drift Analysis

## Scope

The codebase was audited against:

- `docs/coding-standards.md`
- `docs/context.md`
- `docs/feature-architecture.md`
- Accepted ADRs `0001`–`0024`
- Source code, tests, release workflows, and recent churn

Five parallel subagents analyzed security and persistence, agents and sessions, UI tools, cross-cutting architecture health, and ADR traceability.

## Executive Assessment

The codebase has **not fundamentally abandoned its intended architecture**. Its strongest foundations remain intact:

- Electron process separation is generally respected.
- Renderer code does not import Node, Electron, SQLite, or main-process code.
- SQLite remains main-owned with WAL and foreign keys.
- Browser content is strongly sandboxed.
- GitHub credentials and authenticated Git are handled carefully.
- Features follow the `main` / `renderer` / `shared` layout.
- Managed services and adapters have substantial test coverage.

However, the application has drifted in three important ways:

1. Some accepted safety and lifecycle invariants are violated.
2. Application composition has moved into feature IPC/runtime modules, creating a large dependency cycle.
3. Renderer orchestration and state ownership have become duplicated and oversized.

This is architectural pressure caused by incremental vertical delivery—not a reason for a rewrite.

## Most Serious Findings

### 1. Project Sessions can restore into the base checkout

**Severity: Blocker**

`src/features/agent-workspace/main/agent-session-handler.ts:1040-1053` falls back to `project.path` when all persisted managed-worktree fields are absent.

ADR 0013 explicitly requires missing or invalid worktree identity to fail rather than run in the registered base checkout.

**Risk:** An incomplete or legacy Session can launch Pi’s `bash`, `edit`, and `write` tools against the builder’s base checkout. This defeats Project Session isolation and can allow concurrent agents to modify the same checkout.

**Safe first step:** Add a regression test where an active Project Session has all worktree fields set to `null`, assert that no utility Session starts, and make restoration fail closed with recovery guidance.

### 2. Project archive bypasses managed Session cleanup

**Severity: Blocker**

`src/features/projects/main/project-lifecycle-orchestration.ts:39-49`:

- Marks Sessions and Project archived first.
- Does not remove managed worktrees or branches.
- Swallows utility shutdown errors with `.catch(() => undefined)`.

The correct single-Session workflow already exists in `src/features/sessions/main/session-cleanup.service.ts:174-190`.

**Risk:** Archiving a Project can leave worktrees and branches behind, hide a still-running agent, claim archival succeeded despite cleanup failure, and lose the fail-closed recovery behavior required by ADR 0013.

**Safe first step:** Route Project archival through the existing Session cleanup service. Add a failure test asserting that neither Project nor Session becomes archived when agent stop or worktree removal fails.

### 3. The privileged app window is not pinned to trusted navigation

**Severity: High security risk**

`src/main/index.ts:81-124` configures the main app window with the full Space Zero preload bridge and denies new windows, but it does not prevent top-level navigation to an untrusted URL.

The embedded Browser correctly has navigation policy in `src/features/browser/main/browser.webcontents-adapter.ts:77-95`.

**Risk:** If the privileged renderer navigates to remote content, that document may receive the Space Zero preload API, including Files, Terminal, Agent, GitHub, and settings capabilities.

**Safe first step:** Add a `will-navigate` guard permitting only the packaged renderer or configured development origin. Add an Electron test proving remote navigation is denied.

### 4. IPC validates payloads, but not the caller

**Severity: High when combined with finding 3**

Most sensitive handlers validate Zod schemas well, but there is no common sender/frame authorization.

Examples:

- `src/features/files/main/files.ipc.ts:222-242`
- `src/features/settings/main/settings.ipc.ts:110-157`
- `src/features/terminal/main/terminal.ipc.ts:83-154`

**Risk:** Schema validation proves that a request is shaped correctly, not that it came from the trusted Space Zero frame.

**Safe first step:** Introduce a shared `assertTrustedIpcSender(event)` or secure handler wrapper and apply it first to file mutations, terminal input, credential changes, and agent prompt/control operations.

## Structural Architecture Weakness

### 5. Ten main-process features form one dependency cycle

**Severity: High**

An import graph found a strongly connected component containing:

- `agent-workspace`
- `agents`
- `browser`
- `github`
- `knowledge-base`
- `projects`
- `sessions`
- `settings`
- `terminal`
- `workspace`

Representative cycles:

- `agent-workspace/main/agent.ipc.ts` imports Sessions.
- `sessions/main/sessions.ipc.ts` imports Agent Workspace.
- `projects/main/projects.ipc.ts` reaches into Agent, Browser, Knowledge Base, Sessions, and Terminal.
- Session cleanup reaches back into Browser, Projects, and Terminal.

This contradicts the feature guide’s direction to use runtime public APIs or application-level orchestrators rather than deep cross-feature implementation imports.

**Why this happened:** Cross-feature application workflows were composed inside feature IPC and runtime files because those were convenient entrypoints.

**Risk:** ESM initialization-order hazards, hidden singleton coupling, non-local changes, difficult isolated testing, and feature implementation files becoming de facto public APIs.

**Direction:** Move application composition to the main-process composition root. Inject narrow capabilities such as:

```ts
closeBrowserContext()
closeTerminalContext()
stopAgentSession()
cleanupProjectSessions()
```

Do not create a universal service locator or a new layer of pass-through wrappers.

### 6. Renderer controllers have become shallow “god modules”

**Severity: High maintainability pressure**

Major hotspots:

| File | Size |
|---|---:|
| `files-tool.tsx` | 1,965 lines |
| `terminal.service.ts` | 1,446 lines |
| `pi-agent-session-factory.ts` | 1,332 lines |
| `files-store.ts` | 1,140 lines |
| `agent-session-handler.ts` | 1,107 lines |
| `git-tool.tsx` | 1,089 lines |
| `workspace-shell.tsx` | 1,016 lines |

The clearest problems are:

- `FilesToolSession`: approximately 1,197 lines
- `WorkspaceShell`: approximately 556 lines
- `GitToolSession`: approximately 406 lines

`FilesToolSession` owns tree adaptation, search, observation, saving, conflict handling, drag/drop, dialogs, commands, editor lifecycle, and rendering.

**Why this violates the engineering rules:** The modules do not hide complexity behind smaller interfaces. Complexity is exposed as effects, refs, callbacks, and sequencing in one component.

The `FilesToolView` boundary is technically pure but accepts roughly 37 state/ref/callback props, making it a shallow interface.

**Direction:** Extract cohesive behavioral capabilities rather than merely splitting JSX:

- Document persistence/conflict controller
- Explorer/search controller
- File observation controller
- File operations controller
- Git review refresh/subscription controller
- Workspace context selection controller

### 7. Files save/conflict policy is duplicated

**Severity: High data-integrity risk**

The save/conflict workflow is separately implemented in:

- `src/features/files/renderer/components/files-tool.tsx:480-505`
- `src/features/files/renderer/files-side-pane.ts:46-83`
- `src/features/git/renderer/git-side-pane.ts:29-78`
- `src/features/files/renderer/files-exit-guard.ts:60-145`

Even the conflict message is duplicated.

**Risk:** A correction to revision handling, save failure, newer local edits, or close behavior can be applied to one surface and missed in another.

**Direction:** Files should own one capability resembling:

```ts
persistDocumentSnapshot(request): Promise<PersistDocumentResult>
```

It should own revision validation, saving state, conflict state, external revision updates, and failure state. Callers should only decide whether to close, remain open, or summarize errors.

### 8. Side Pane tab ownership is duplicated

**Severity: Medium, with current regression evidence**

ADR 0022 says the Side Pane owns peer tab order and active tab. Currently:

- Side Pane persists order/activation in Zustand.
- Files owns another tabs array and active path.
- Browser persists its own order and active tab in SQLite.
- Terminal persists its own order and active tab in SQLite.

**Risk:** Synchronization can disagree during mixed-category reorder, restore, partial resource creation, resource cleanup, and tab activation.

Two deterministic Side Pane tests are currently failing because expected ordering and implementation behavior disagree.

**Direction:** Side Pane should be authoritative for peer order and activation. Category services should own resource lifecycle and category-specific restoration metadata only.

## Agent Architecture Drift

### 9. Workspace Tool confirmations are not uniquely Session-scoped

**Severity: High**

Pending confirmations are keyed only by `callId` in `src/features/agent-workspace/main/agent-utility-process.ts:75-78`.

Resolution and timeout also use only `callId` in `src/features/agent-workspace/main/agent-utility-process.ts:221-284`.

**Risk:** Two concurrent Sessions using the same Pi call ID can overwrite each other. One request can hang or resolve against the wrong Session. Pending confirmation state also cannot be recovered after renderer reload.

**Direction:** Key confirmation state by `(sessionId, callId)` and include pending confirmations in replayable Session projection state.

### 10. Workspace Tool safety policy is hard-coded

**Severity: High product-contract drift**

`workspace-tool-control-plane.ts:14-19` always constructs the executor with `DEFAULT_WORKSPACE_TOOL_SAFETY_POLICY`.

ADR 0005 requires a global, user-configurable policy allowing builders to opt into write or dangerous tools without confirmation.

No persisted settings service, IPC, preload API, or Settings UI exists for this.

**Safe first step:** Persist the two policy booleans in `app_settings`, expose typed settings APIs, and make the executor query the current policy when deciding.

### 11. Delegated agents cannot request confirmation-gated tools

**Severity: High**

`workspace-tool-executor.ts:100-118` rejects confirmation-required Workspace Tools whenever the caller has a `parentSessionId`.

This is not the normal safety policy described by ADRs 0005 and 0011.

**Risk:** A delegated writer with an allowed write tool fails under conservative defaults rather than presenting confirmation in the parent transcript.

**Direction:** Route child confirmation to the visible parent while preserving child Session and call identity.

### 12. Workspace Tool activity history is effectively unfinished

**Severity: Medium**

The activity history:

- Is process-local and in-memory.
- Has no bounded retention.
- Has no renderer query.
- Has no UI consumer.
- Disappears on restart.

Relevant files:

- `agent-activity-history.ts`
- `workspace-tool-control-plane.ts:38-40`

The architecture exists, but the documented visibility/debugging capability does not.

### 13. Placeholder Workspace Tools undermine the control plane

`src/features/workspace/main/workspace.tools.ts:22-36` exposes `workspace.setScratchNote`, but it simply returns the supplied note and persists nothing.

This violates the expectation that Workspace Tools route to meaningful application services. It should either be removed or backed by a real main-owned capability shared with human UI.

## Additional Drift

### Terminal

- Retained scrollback is bounded.
- Live IPC output has no explicit batching, acknowledgement, queue cap, or backpressure policy.
- This is incomplete against ADR 0014.
- The packaged `node-pty` smoke exists but is not executed by the macOS release workflow.

### Keyboard shortcuts

User remapping currently exists only as in-memory Maps in `src/features/keyboard-shortcuts/renderer/keyboard-shortcut-manager.ts`.

Overrides are not persisted, and App Command definitions do not own their default shortcut metadata. This drifts from the product contract in `docs/context.md`.

### Migrations

`migrateDatabase()` performs real schema upgrades and data backfills, but tests largely inspect SQL strings through a fake database.

They do not prove:

- Actual SQLite syntax
- Upgrade idempotency
- Foreign-key behavior
- Backfill correctness
- Representative legacy database upgrades

### Shared Diff Viewer

The product describes Diff Viewer as a shared renderer primitive, but:

- Git imports Files internals.
- GitHub imports a deep Git component path.
- Git directly knows Files store representation and editor identity details.

A narrow shared renderer code-surface and document-buffer interface would reduce this coupling.

### Untyped renderer event bus

Chat-context changes are coordinated through duplicated global DOM event strings and `CustomEvent` casts across Sessions, Knowledge Base, Git, and Workspace Shell.

These payload contracts can drift without TypeScript detecting it.

## ADR Compliance Summary

### Strongly compliant

- **0001** Electron shell
- **0003** Main-owned SQLite
- **0008** Zustand for renderer UI state
- **0009** Configurable Space Zero Home
- **0010** Skill scopes and trust gating
- **0012** GitHub authentication and credential boundaries
- **0016** Main-owned sandboxed Browser
- **0019** Trees adoption
- **0020** Stable Workspace Contexts and rotatable Chat Contexts
- **0023** Diffs Edit core direction
- **0024** Pure view/container pattern on newer visual surfaces

### Materially partial or drifted

- **0002:** Missing privileged-window navigation guard and sender authentication
- **0004:** Runtime layout is correct, but cross-feature dependency direction is weak
- **0005:** Safety policy/history/placeholders incomplete
- **0006:** Confirmation ownership/replay and OAuth URL validation gaps
- **0007:** Duplicate Workspace Tool projection path
- **0011:** Child confirmation behavior contradicts normal policy
- **0013:** Base-checkout restoration and Project archival violate core invariants
- **0014:** Missing live-output backpressure and packaged release smoke
- **0018:** Core update/license implementation exists, but release/runtime verification is incomplete
- **0022:** Side Pane order and activation have multiple authorities

### Intentional supersession, not harmful drift

- ADR 0015’s Monaco/react-arborist choices were superseded by ADRs 0019 and 0023.
- ADR 0017’s read-only diff presentation was amended by ADR 0023 to permit working-buffer editing.
- Remaining `workspace-session` database enum values may be compatibility residue rather than active product drift.

## Recommended Architecture Opportunities

### Now

#### 1. Restore Project Session isolation invariants

Fix the all-null worktree fallback and make Project archival use the fail-closed cleanup workflow.

This is the highest-leverage and highest-risk work.

#### 2. Pin and authenticate the privileged Electron boundary

Add main-window navigation policy and trusted IPC sender validation.

#### 3. Restore a deterministic green test suite

The definitive audit run produced:

- 215 test files
- 1,789 passing tests
- 5 failures
- 4 skipped tests

The deterministic failures are:

- Three App tests crashing because the global canvas mock lacks `setTransform`.
- Two Side Pane ordering tests where behavior and specification disagree.

Architecture refactoring should not begin without a reliable safety net.

#### 4. Break the first main-process dependency cycle

Start with Project archive/delete composition. Move Browser, Terminal, Agent, and Session cleanup wiring out of `projects.ipc.ts` and into the main composition root.

### Next

#### 5. Centralize Files document persistence policy

Remove duplicated save/conflict transitions across Files, Git Diff, close, and quit handling.

#### 6. Establish one Side Pane tab authority

Side Pane owns order/activation; categories own resources.

#### 7. Complete Workspace Tool policy and confirmation lifecycle

Persist safety settings, key confirmations by Session and call, support child confirmation, and make pending confirmation replayable.

#### 8. Extract cohesive renderer controllers

Begin with Files search/observation or save/conflict behavior—not arbitrary component splitting.

### Later

- Persist user keybindings.
- Expose bounded Agent Activity History.
- Create a shared renderer code/diff surface.
- Replace global chat-context DOM events with typed subscriptions.
- Separate real-Git integration tests from fast unit/component tests.
- Add runtime import-boundary lint rules.
- Add packaged PTY smoke to release validation.

## What Should Not Be Refactored Yet

Avoid cosmetic splitting of:

- `src/preload/index.ts`
- `src/shared/ipc.ts`
- `src/main/pi-agent-session-factory.ts`
- `src/features/terminal/main/terminal.service.ts`
- Runtime-specific feature barrels
- Generated router files
- Legacy storage terminology needed for migration compatibility
- Vendor/design-system components such as `ui/sidebar.tsx`

These may be large, but several currently hide real adapter or lifecycle complexity. Change them only behind a specific behavioral goal.

## Validation

- `pnpm typecheck`: passed
- `pnpm lint`: passed
- `pnpm test`: failed with 5 deterministic failures
- Electron e2e: not run because unit validation was already red
- No source code was changed during the audit

## Detailed Parallel Reports

The underlying audit reports are stored under:

```text
.pi-subagents/artifacts/outputs/c73b3ef6-14ea-4dfc-92dd-c0151abea203/audit/
```

## Session ID

`01a006b5-43ed-70a6-96fe-7d37840e3078`
