# ADR 0020: Use stable workspace contexts with rotatable chat contexts

- Status: Accepted
- Date: 2026-07-29
- Amends: ADR 0006, ADR 0013
- Supersession note: ADR 0022 replaces Tool Pane state with context-scoped Side Pane tab state. The stable Workspace Context versus rotatable Chat Context distinction remains accepted, and Side Pane state keys off the same stable workspace identity.

## Context

Space Zero originally modeled user-facing agent work as Project Sessions and Workspace Sessions, with one Pi `AgentSession` per Space Zero Session. That made sense while every independent chat was also a separate workspace/runtime container.

The product direction now separates the durable workspace container from the chat transcript and conversation memory. Builders need to clear agent memory or resume older conversations without losing the surrounding workspace state. This matters most for Project Sessions: a builder may want a fresh agent conversation while keeping the same managed worktree, branch, files, Git state, Browser tabs, Terminal sessions, Tool Pane state, and GitHub source link.

The same interaction should apply consistently to the app-level Chat and Knowledge Base Chat. Creating multiple ordinary global Workspace Sessions adds navigation noise when the desired behavior is really fresh/resumable chat history inside one stable global context.

## Decision

Space Zero uses stable **workspace contexts** with rotatable **Chat Contexts**.

A workspace context owns durable workspace/tool state:

- the single **Global Chat** context, exposed as a dedicated **Chat** navigation item near Knowledge Base
- the **Knowledge Base** context
- each **Project Session** context, including its managed Git worktree and source identity

A Chat Context owns one agent transcript and conversation memory scope inside a workspace context.

The chat commands behave consistently across Global Chat, Knowledge Base Chat, and Project Session chat:

- `/clear` creates a fresh current Chat Context for the same workspace context.
- `/clear` does not archive or delete the owning workspace context.
- `/clear` does not remove Project Session worktrees, files, Git state, source links, Browser state, Terminal state, Files state, or Tool Pane layout.
- Older Chat Contexts remain available in history.
- `/resume` lists older Chat Contexts scoped to the current workspace context.
- Choosing an older Chat Context makes it current again and continues it in the same workspace context; for Project Sessions, this means continuing in the same managed worktree.

Space Zero no longer exposes ordinary user-created Workspace Sessions. The previous “global Workspace Session” product concept is replaced by one Global Chat surface. Users get freshness and history through `/clear` and `/resume`, not by creating many global sessions.

Knowledge Base keeps chat as the primary center surface. When the Knowledge Base screen opens, the Files tool opens by default in the Tool Pane so the builder immediately sees the Knowledge Base file explorer beside chat.

The chat composer presents `/clear` and `/resume` through the same slash suggestion surface used for skills, but with command-style icons. Submitting `/resume` displays the current workspace context's Chat Context history list in that same area. Each history row uses a `file-text` icon, shows the initial prompt truncated to one line, and shows the Chat Context creation date/time as secondary text when available.

## Rationale

This model matches the builder's mental model better than tying every chat reset to a new Session. A worktree is a workspace state container; a transcript is conversation memory. Clearing memory should not imply changing repositories or abandoning in-progress files.

It also reduces global navigation clutter. A single app-level Chat is enough for general Space Zero questions and operations when `/clear` can provide a fresh conversation and `/resume` can recover older ones.

Project Sessions still remain first-class because their worktrees, GitHub source links, and task-to-ship state are durable product objects. The change is that a Project Session can have multiple Chat Contexts over time.

## Consequences

- ADR 0006's “one Pi `AgentSession` per Space Zero Session” rule is no longer the product model. Implementation may still use Pi runtime objects internally, but Space Zero must model Chat Contexts separately from stable workspace contexts.
- ADR 0013's managed worktree decision remains valid for Project Sessions, but clearing/resuming chat must not create or delete the worktree.
- SQLite needs to represent current and historical Chat Contexts scoped to a workspace context.
- Agent runtime routing needs a stable workspace-context identity plus a current Chat Context identity.
- UI session lists should remove ordinary global Workspace Sessions and replace them with one Chat navigation item.
- Knowledge Base Chat history is scoped to the Knowledge Base context, not to user-created Workspace Sessions.
- Project Session history is scoped to the Project Session/worktree.
- Terminal, Browser, Files, and Tool Pane state should key off the stable workspace context, not the current Chat Context.
- Chat Context records should store or derive enough metadata for `/resume` history rows, including the initial prompt and creation date/time when available.

## Alternatives Considered

- Keep ordinary Workspace Sessions and add `/clear` only to Project Sessions — rejected because it leaves inconsistent chat semantics and keeps unnecessary global-session navigation clutter.
- Treat `/clear` as archive-and-create-new-session — rejected because it would destroy or detach important workspace state, especially Project Session worktrees.
- Make older chat history read-only — rejected because builders may need to return to and continue a previous reasoning thread in the same workspace/worktree.

## Review Trigger

Revisit this decision if users need multiple independent global app chats visible at the same time, or if Pi runtime constraints make continuing multiple historical Chat Contexts inside one stable workspace context impractical.
