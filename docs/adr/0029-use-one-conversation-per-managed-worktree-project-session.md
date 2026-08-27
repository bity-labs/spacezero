# ADR 0029: Use one conversation per managed-worktree Project Session

## Status

Accepted

## Context

The initial Space Zero product wedge is one dependable coding-agent workflow. Project Session identity must be clear before defining Session events, worktree restoration, Pi transcript links, shutdown, archive, deletion, and future Remote Host behavior.

The archived v0 product model allowed one stable Project Session worktree to contain multiple rotatable Chat Contexts. That flexibility adds separate workspace, conversation, event-stream, restoration, and command identities before the initial workflow demonstrates a need for them.

Agent tools must never run in a builder's registered base checkout. Git worktrees provide local isolation, but their creation and cleanup are external side effects that cannot be atomically committed with SQLite. The event-sourced Session model therefore needs explicit provisioning and recovery states.

## Decision

For the initial implementation, one **Project Session** owns exactly:

- one Pi conversation;
- one authoritative Session event stream;
- one Space Zero-managed Git worktree;
- one collision-resistant managed Git branch; and
- one focused agent workflow.

Multiple Chat Contexts, `/clear` within an existing Project Session, and conversation rotation inside one worktree are deferred. A future decision may introduce a separate conversation identity if concrete workflows require it.

### Session naming

Each Project Session receives one permanent Host-unique name selected randomly from a bundled list of French wine appellations normalized to lowercase, unaccented kebab-case. A base appellation name is never reused by that Host, including after provisioning failure or archive. After every base name has been allocated, the Host appends a collision-checked five-character lowercase alphanumeric suffix that excludes visually ambiguous characters and retries on collision. The Host persists the allocated name as part of Session creation; clients neither choose nor reserve names. Automatic title generation from the first user prompt is deferred until the Pi/chat workflow is implemented.

### Git requirement and source revision

Initial Project Sessions require a registered Git repository with at least one commit. Non-Git folders and repositories without a valid `HEAD` are deferred and fail with actionable guidance rather than receiving weaker isolation.

A new Project Session starts from the registered Project checkout's current `HEAD` at creation time. Space Zero persists:

- repository identity;
- source branch or detached-HEAD state;
- exact source commit SHA;
- managed branch name;
- managed worktree path; and
- owning Host identity.

The registered base checkout is never switched, reset, or modified by Session creation. Later changes to the base checkout do not alter an existing Session's source or worktree.

Uncommitted base-checkout changes are not copied into the Session. A dirty base checkout does not block creation. The Session records that uncommitted changes were excluded and, until the first user message is submitted, Chat displays a warning above the input with the source branch and abbreviated commit. Reopening an untouched Session shows the warning again; submitting the first message dismisses it because the builder has proceeded with the recorded source state.

Branch/source selection, Issue-linked revisions, and Pull Request-linked revisions are deferred.

### Managed worktree location

Local Project Session worktrees live under the centralized user-owned root:

```text
<Space Zero Home>/worktrees/<project-id>/<session-id>/
```

Space Zero Home defaults to `~/SpaceZero`.

Space Zero does not create `.worktrees` inside registered repositories, write managed worktrees beside arbitrary Project folders, or modify a Project's `.gitignore`. Existing Projects may remain anywhere and are registered rather than moved.

Private SQLite databases, Pi transcripts, adapter-private Pi runtime/session state, credentials, logs, and caches remain in operating-system application data rather than Space Zero Home or Session worktrees.

Future Remote Hosts use a Host-managed equivalent and must not assume the local `~/SpaceZero` path.

### Durable provisioning lifecycle

Session creation is a durable, recoverable workflow rather than an in-memory sequence around Git side effects.

The event-sourced lifecycle is conceptually:

```text
SessionCreationRequested
  -> Session projection: provisioning
  -> create managed branch and worktree
  -> validate managed identity
  -> WorkspacePrepared
  -> SessionReady
```

Pi does not start until the worktree is ready and its identity has been validated.

On provisioning failure, the Host records the failure, attempts verified cleanup of resources it can authenticate, and records the cleanup outcome. Failed provisioning attempts are excluded from the ordinary active Session list but remain available to diagnostics and recovery. A Host restart inspects durable provisioning state and reconciles authenticated Git resources rather than guessing or silently starting in another path.

SQLite transactions do not span Git commands. Requested, succeeded, failed, and recovery outcomes are separate durable facts where required.

### Restore and authentication

Before restoring Pi or allowing Session filesystem, process, or Git operations, the Host verifies that:

- the persisted path is under the expected managed worktree root for the Project and Session;
- the path is not the registered base checkout;
- Git registers it as a worktree of the persisted repository/common Git directory;
- the checked-out branch matches the persisted managed branch; and
- the persisted source revision remains a valid Git object for diagnostics and recovery.

Missing, incomplete, or inconsistent identity fails closed with recovery guidance. The Host never falls back to the registered base checkout.

Destructive cleanup uses authenticated Git worktree and branch operations. It never recursively deletes an unverified persisted path.

### Quit, archive, and deletion

Explicitly quitting Desktop:

- warns about active local Sessions;
- stops local agent execution coherently;
- persists durable Session state;
- retains each managed worktree and branch; and
- then stops the Local Host.

Restoring Desktop may resume the same Project Session only after worktree authentication and Pi reconciliation. Missing, corrupt, mismatched, ahead/behind, or ambiguous private Pi state makes the Project Session `recovery_required` rather than falling back to text-only replay.

Archiving a Project Session:

- requires active execution to stop;
- authenticates and removes the managed worktree and branch;
- preserves the Session Event Journal, projections needed for history, source revision, and diagnostic metadata;
- purges adapter-private Pi runtime/session state by default because archive is history-only; and
- makes the archived Session history-only unless a future explicit continuation workflow is designed.

Permanently deleting a Project Session:

- stops active execution;
- authenticates and removes any remaining managed worktree and branch;
- then deletes the Session Event Journal, projections, command receipts, Pi transcript reference/data, adapter-private Pi runtime/session state, and metadata.

If stop or cleanup fails, archive or deletion does not claim success. Recovery metadata remains durable and the failure is visible.

## Rationale

One conversation, event stream, and worktree per Project Session gives the initial product one clear identity across UI, Host Contracts, SQLite, Pi, Git, and recovery. It avoids designing conversation rotation before the narrow task-to-ship workflow is dependable.

Branching from current `HEAD` respects the builder's current repository context without mutating the base checkout. Persisting the exact commit makes the source deterministic even after the base checkout changes.

Centralized worktrees avoid repository pollution, recursive discovery, `.gitignore` modification, arbitrary parent-directory writes, and inconsistent cleanup roots. Explicit lifecycle events make cross-database/Git failure and crash recovery observable.

Retaining worktrees on Desktop quit preserves resumability, while removing them on archive controls disk usage and clearly makes archive a history-only state.

## Consequences

- Session creation UI must display the selected current branch/commit and dirty-checkout warning when applicable.
- The Host must implement Project-scoped concurrency control so simultaneous creation and destructive lifecycle operations cannot race repository identity.
- Session events and projections must represent provisioning, ready, failure, stopping, archived, deletion, and recovery states.
- Managed branch names must include stable Session identity and remain collision-resistant and recognizable.
- Archived Sessions cannot resume in place because their worktrees and branches are removed.
- Future multiple-conversation support requires a new identity and migration decision rather than overloading Project Session now.
- Future local-to-remote Session Handoff creates a remote continuation from an explicit checkpoint; it does not move this live worktree or Pi process.

## Alternatives Considered

- **Multiple Chat Contexts in one Project Session from the start** — rejected because it multiplies transcript and lifecycle identities before the initial workflow requires it.
- **Run agents in the registered base checkout** — rejected because concurrent work and cleanup would risk builder-owned state.
- **Start every Session from the repository default branch** — rejected because it ignores the builder's intentionally selected current branch.
- **Block creation when the base checkout is dirty** — rejected as unnecessarily restrictive when a clear warning can explain that only committed `HEAD` is used.
- **Copy uncommitted changes automatically** — rejected because patch transfer, conflicts, untracked files, ignored files, and secret handling require a separate explicit workflow.
- **Create `.worktrees` inside each Project** — rejected because it pollutes repositories, affects watchers and search, and complicates authenticated cleanup.
- **Treat Git and SQLite creation as one implicit operation** — rejected because external Git side effects cannot participate in a SQLite transaction and require durable reconciliation.
- **Remove worktrees when Desktop quits** — rejected because it would destroy the resumable local workspace lifecycle.
- **Keep worktrees after archive** — rejected because archive is a history-only state in the initial model and should release managed workspace resources.

## Review Trigger

Revisit this decision if:

- builders need multiple independent conversations against one preserved worktree;
- non-Git project support becomes part of the initial product wedge;
- current-HEAD defaults repeatedly surprise builders despite source display and dirty-state warning;
- centralized worktrees cause demonstrated cross-volume performance or storage problems;
- archived Sessions need in-place restoration rather than explicit continuation; or
- Remote Host placement or Session Handoff requires a broader workspace identity model.
