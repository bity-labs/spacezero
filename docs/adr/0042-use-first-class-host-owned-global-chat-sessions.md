# ADR 0042: Use first-class Host-owned Global Chat Sessions

## Status

Accepted

## Context

Space Zero's initial v0.1 Session model focused on Project Sessions: one Pi conversation, one Session Event Journal, and one managed Git worktree/branch per Project Session. Global Chat and Chat Context rotation were previously deferred to avoid multiplying identities before the core project-bound workflow was dependable.

The product now needs basic app-level chat history that is not tied to a Project, worktree, branch, source revision, Files, or Git lifecycle. The requested UX includes a Chats section in the App Sidebar, a New Chat action, recent unarchived chats, and an All Chats screen split between unarchived and archived sessions.

Implementing this as renderer-local state or Pi-only transcript history would conflict with existing Space Zero boundaries: renderer owns UI only, Pi remains an implementation detail, and durable agent conversation history belongs behind the Workspace Host and Host Protocol.

## Decision

Space Zero will implement **Global Chat Sessions** as first-class Host-owned Sessions.

A Global Chat Session:

- is an app-level agent conversation inside Global Chat;
- is not tied to a Project, Knowledge Base, worktree, branch, source revision, Files root, or Git lifecycle;
- is created only when the first user prompt is sent from a New Chat draft UI through one idempotent Host command that creates the session, records the first user message, starts the first turn, and returns the created session;
- derives its initial display title from the trimmed first line of the first user prompt with deterministic truncation to 60 characters and supports user rename from the active chat header, including while archived;
- owns one Pi conversation through Pi Adapter;
- owns one durable Session Event Journal and rebuildable projections in Host SQLite;
- uses the same event-sourced prompt, assistant-message, turn, archive/unarchive, projection, command-idempotency, cursor-replay, runtime-configuration, per-turn runtime snapshot, follow-up, interrupt, retry, and recovery patterns as Project Sessions where those concepts apply;
- may use approved read-only workspace/app inspection Workspace Tools in the first implementation;
- must not receive Project, Files, Git, worktree-scoped capabilities, or app-state mutation tools in the first implementation; and
- is history-only while archived and cannot receive new prompts until unarchived.

The App Sidebar will expose an expandable **Chats** section above **Projects**. It shows up to 10 recent unarchived Global Chat Sessions by title only, sorted by last updated descending, with an archive icon on each chat row and actions for **New Chat** and **All Chats**. The All Chats screen shows unarchived and archived Global Chat Sessions in separate tabs; each row shows title, last-message preview, and last-updated time. When no Global Chat Session is selected, the Chat area opens the All Chats screen. The All Chats screen defaults to the Unarchived tab, does not include search/filter in the first implementation, and provides a New Chat action. If there are no chats to show, it displays an empty placeholder with a CTA to create a new chat. App restart should restore the last active Global Chat route when that route was active before quit; if the selected Session is unavailable, Space Zero falls back to All Chats. Global Chat Sessions can be renamed from the active chat header. The first implementation supports opening sessions plus archive/unarchive actions from the All Chats screen and the active chat header. Opening an archived session shows a read-only chat with the composer disabled and an **Unarchive to continue** action. Archiving the active session keeps it open in read-only state and removes it from the App Sidebar recent list. Unarchiving the active session keeps it open, re-enables the composer, and returns it to the recent list according to last-updated order. Permanent deletion is deferred.

Safe app-state mutation Workspace Tools for Global Chat are deferred to follow-up issue https://github.com/bity-labs/spacezero/issues/515.

## Rationale

First-class Host-owned Global Chat Sessions match the requested user model: multiple independent global chats with normal history, archive state, and a full list screen.

Using the Workspace Host preserves Space Zero's existing security and ownership boundaries. The renderer receives client-safe projections and invokes Host Protocol commands; it does not own durable chat state, Pi execution, credentials, or recovery semantics.

Using the same Session Event Journal pattern as Project Sessions avoids creating two competing persistence and recovery models for agent conversations. Global Chat Sessions still need durable prompts, assistant messages, streaming/cursor replay, command idempotency, interruption, follow-up behavior, runtime configuration, and restart recovery. The absence of Project/Git/worktree identity changes capabilities, not the core conversation durability model.

Creating the durable record only after the first prompt avoids cluttering chat history with abandoned empty drafts while still supporting a clear New Chat UX.

Making archived Global Chat Sessions history-only keeps ordinary navigation clean and avoids accidental continuation of intentionally archived conversations.

## Consequences

- Host Contracts need Global Chat Session schemas, commands, queries, events, projections, and public errors that remain client-safe and independent of Pi internals.
- Workspace Host needs SQLite migrations, event repositories, projectors, command receipts, archive/unarchive behavior, and recovery handling for Global Chat Sessions.
- Client Runtime needs browser-safe Global Chat Session APIs and projection/subscription behavior over the authenticated Host Protocol.
- Pi Adapter needs a Global Chat execution path that creates/restores one Pi conversation per Global Chat Session without Project/worktree resources.
- Desktop renderer needs Chats sidebar navigation, New Chat draft behavior, a Global Chat conversation surface, and an All Chats screen with Unarchived and Archived tabs.
- Runtime configuration UI and behavior should be shared conceptually with Project Sessions while keeping React/generic UI Effect-free.
- Workspace Tool authorization must distinguish Global Chat read-only inspection capabilities from Project, Files, Git, worktree-scoped, and mutation capabilities.
- Existing ADRs and docs that previously described Global Chat as deferred must be read with this ADR as the reintroduction decision.
- Permanent deletion, Project attachment, Chat Context rotation, `/clear`, `/resume`, Knowledge Base Chat, and Global Chat app-state mutation tools remain separate future decisions or issues.

## Alternatives Considered

- **Single stable Global Chat with rotatable Chat Contexts** — rejected for this slice because the requested UX is multiple first-class chat sessions with archive/list behavior, not one workspace context with hidden conversation rotation.
- **Renderer-local chat history** — rejected because it would be fragile across restarts, duplicate Host-owned agent state, and violate the renderer/UI-only boundary.
- **Pi-only transcript history** — rejected because Pi transcripts are private adapter data and not stable Space Zero product contracts for archive state, projections, command idempotency, or client replay.
- **Project Sessions shown as chats** — rejected because the requested chats are explicitly not tied to Projects, worktrees, or Git.
- **Create empty durable sessions immediately on New Chat** — rejected because it would clutter history with abandoned empty chats.
- **Allow all Project Session tools in Global Chat** — rejected because Project, Files, Git, and worktree-scoped tools require identities that Global Chat Sessions deliberately do not own.
- **Include safe app-state mutation tools immediately** — deferred because mutation tools require refined safety policy, authorization, and activity-history design.

## Review Trigger

Revisit this decision if:

- Global Chat Sessions require Project, Knowledge Base, Files, Git, or worktree identity to satisfy core workflows;
- users need one stable Global Chat context with rotatable Chat Contexts instead of multiple first-class sessions;
- maintaining separate Project Session and Global Chat Session event vocabularies creates excessive duplication that warrants a shared Host-owned Session abstraction;
- Pi runtime constraints prevent reliable restoration of many non-project conversations; or
- read-only Workspace Tools are insufficient and mutation tools become necessary enough to justify a separate safety/authorization decision.
