# ADR 0013: Isolate Project Sessions in managed worktrees and persist GitHub source links

- Status: Accepted
- Date: 2026-07-18
- Issues: #81, #83, #97, #98
- Amended by: ADR 0020

## Context

Project Sessions currently run in a Project's registered path. Concurrent agents can therefore change the same checkout, and a Session started from GitHub has no durable explanation of why it exists. Git and filesystem operations must stay in Electron main, while SQLite remains the source of truth for Session metadata.

## Decision

- Every newly created Project Session receives a dedicated Git worktree below `<Space Zero Home>/worktrees/<project-id>/<session-id>`.
- **Create empty project** initializes a repository with an empty initial commit so its first Session is immediately worktree-capable. Newly registered folder Projects must be Git repositories with a commit and are canonicalized to the repository top level. Before Session creation, an upgraded Project record that still points to a repository subdirectory is canonicalized and persisted; upgraded non-Git or no-commit Projects fail with actionable repair guidance.
- The registered Project path remains the base repository and is not checked out or switched during Session creation. Project path edits and Session creation share a Project-scoped lifecycle lock, and path changes are refused while any managed Session metadata exists so restore and cleanup retain the repository identity they authenticated.
- Ordinary and Issue-linked Sessions branch from the base repository's current `HEAD`.
- Pull Request-linked Sessions fetch the base repository's `refs/pull/<number>/head` with main-owned GitHub authorization and branch from the fetched revision. This also supports fork-origin Pull Requests without making a fork remote durable.
- Managed branch names use the collision-resistant Session id and a readable `spacezero/<source>-<number>-<id>` prefix.
- SQLite stores the worktree path, branch, and base revision for restore and diagnostics.
- SQLite also stores a structured GitHub source link: source type, stable repository id/node id, owner/name, number, URL, and title. Issue bodies, comments, diffs, checks, and reviews remain runtime-only.
- Source context is appended to the Pi system prompt at runtime. Initial creation may include current live GitHub detail; restore reconstructs a smaller context from durable source metadata without treating cached GitHub content as current.
- Session creation is ordered as worktree → utility-process agent → SQLite metadata. A failure removes every earlier resource in reverse order. If utility or Git rollback fails, Space Zero stops destructive cleanup, best-effort persists the Session/worktree recovery metadata, and reports an explicit rollback failure instead of silently orphaning resources. The source link becomes visible only with the Session row.
- Archiving a managed Project Session stops the live agent, removes the authenticated managed worktree and branch, and retains the archived Session row with durable source/session metadata. After successful archive cleanup, SQLite clears the worktree path, branch, and base revision so later permanent deletion does not retry already-completed worktree cleanup.
- Permanent Session or Project deletion removes any remaining managed worktree and branch after stopping the live agent, then removes the durable Session row. This preserves cleanup compatibility for legacy archived rows that still carry worktree identity.
- Restore and destructive cleanup authenticate persisted worktree identity before use: the path must match `<Space Zero Home>/worktrees/<project-id>/<session-id>`, remain a non-base worktree registered to the Project repository, share its Git common directory, use the persisted branch, and reference a valid persisted base revision.
- Destructive cleanup uses Git's worktree and branch operations only; it never recursively removes an unverified persisted path. If archive cleanup fails, the Session row is not marked archived and its recovery metadata remains durable. If permanent deletion cleanup fails, the Session row and recovery metadata remain durable.
- If a persisted worktree is missing or invalid at restore time, restore fails explicitly instead of silently running in the base Project checkout.
- Global Chat and Knowledge Base Chat do not use worktrees. Ordinary user-created Workspace Sessions are superseded by ADR 0020.

## Consequences

- Renderer callers request a Project Session by Project/source identity; they do not choose an agent cwd or execute Git.
- Clearing or resuming chat inside a Project Session rotates or selects a Chat Context only; it does not create, delete, archive, or replace the managed worktree.
- Space Zero Home moves do not move existing worktrees. Persisted absolute paths continue to identify existing Session worktrees; new Sessions use the newly configured Home.
- Repositories must have a valid commit at `HEAD`. Existing registered non-Git folders fail explicitly with guidance when starting a managed Session; Space Zero does not silently initialize or commit user-owned folder contents. New non-Git folder registrations are rejected before an unusable Project is persisted. Git LFS and submodule materialization follow normal `git worktree add` behavior and can be handled by later lifecycle improvements.
- Interrupted or externally modified worktrees produce explicit recovery errors. Cleanup may remove the worktree before a later branch-removal failure; retained Session metadata provides diagnostics and manual recovery rather than claiming deletion succeeded. Broader recovery, cleanup policy, and dirty-worktree UX remain follow-up work under #81.
