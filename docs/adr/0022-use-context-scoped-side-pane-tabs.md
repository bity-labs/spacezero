---
title: Use context-scoped Side Pane tabs
---

## Status

Accepted

## Context

Space Zero currently models the substantial workspace surface beside chat as a Tool Pane that displays one selected tool at a time. Files, Git, Browser, and Terminal each own additional internal navigation or tab state. This creates two navigation layers: the Tool Switcher chooses a tool, then the selected tool chooses one of its files, pages, or terminal sessions.

The builder workflow instead needs files, Git review, browser pages, and terminal sessions to coexist as directly reachable peers beside chat. Files still needs one shared explorer and preview/permanent file semantics, but its file tabs do not need a second tab strip inside the tool. Browser pages and terminal sessions similarly do not need internal tab strips when the surrounding pane can own their tabs.

The decision must preserve stable workspace-context isolation from ADR 0020 and the privileged lifecycle boundaries established by ADRs 0014–0017.

## Decision

The contextual, resizable surface beside a context's primary workspace content is the **Side Pane**. Each stable workspace context owns an independent ordered collection of **Side Pane Tabs**.

The Side Pane has four tab categories:

- **Files** — zero or more file tabs plus at most one replaceable preview tab;
- **Git Diff** — at most one tab per repository-backed context;
- **Browser** — one Side Pane tab per browser page; and
- **Terminal** — one Side Pane tab per terminal session and PTY.

The Side Pane has two mutually exclusive presentation states:

- while collapsed, it shows the existing vertical category launcher for the categories available in the current context; and
- while expanded, it hides the launcher and shows only the Side Pane tab strip and active tab content.

Selecting a collapsed launcher category expands the Side Pane and focuses that category's most recently focused tab, creating one when none exists. Code paths that explicitly create a browser page or terminal session create a new tab. A ghost **+** button beside the expanded tab strip opens the available-tab menu. App Commands and keyboard shortcuts invoke the same tab-opening capabilities. Closing the final Side Pane tab collapses the pane and reveals the launcher.

Side Pane state is isolated by stable workspace context. Tabs never move between Project Sessions, Project Home, Knowledge Base, or Global Chat. Each context restores its tab order, active tab, pane width, and tab-type restoration metadata after restart. Browser tabs restore their URL lazily, Terminal tabs start fresh shells at their last validated working directories, Git Diff restores by querying fresh repository state, and Files restores permanent file references and editor view state. A missing restored resource remains visible as a recoverable error rather than disappearing silently.

Files tabs use one shared explorer model per context:

- explorer expansion, search, width, collapsed state, scroll, and selection are shared across Files tabs;
- activating a Files tab selects and reveals its file in the explorer;
- opening Files with available files but no file tab creates an empty Files tab with the explorer open and waits for a selection;
- opening Files in an empty root starts with the explorer collapsed and a **Create new file** empty state;
- creating a file opens it immediately as a permanent tab;
- one tree click opens or replaces the context's clean preview tab;
- double-clicking, editing, saving, or explicitly pinning the preview makes it permanent;
- after the preview becomes permanent, the next one-click selection creates a new preview tab;
- a dirty tab is permanent and cannot be replaced; and
- selecting a file that already has a permanent tab focuses that tab instead of creating a duplicate.

The Side Pane tab strip therefore replaces the internal Files, Browser, and Terminal tab strips. Files tabs still render the shared explorer beside their active file editor; changing Side Pane tabs does not duplicate explorer state.

Context capabilities remain configured rather than universal. Repository-backed Project Home, Project Session, and Knowledge Base contexts expose Files, Git Diff, Browser, and Terminal. Global Chat exposes Browser and Terminal. Project Home Git Diff operates on the registered checkout as a manual review/edit surface and omits agent actions because Project Home has no active chat Session. When Knowledge Base has no saved Side Pane tabs, it creates and shows an initial empty Files tab; otherwise its saved state takes precedence. Unavailable categories remain launcher/menu capabilities only when product requirements call for a visible disabled state.

## Rationale

One peer tab strip makes the builder's open working surfaces directly visible and removes repeated tool-then-inner-tab navigation. Flattening Browser and Terminal tabs matches their natural resource identity: one page or one PTY per tab. Promoting Files tabs preserves familiar preview and pinning behavior while keeping the explorer shared rather than duplicating a full code-editor workspace per file.

The collapsed launcher remains useful as a compact category entry point, while the expanded pane prioritizes open work instead of repeating category controls. Context-scoped ownership preserves repository roots, browser state, terminal processes, editor buffers, and restoration without introducing cross-context transfer rules.

## Consequences

- Existing Tool Pane and Tool Switcher product terminology is replaced by Side Pane, Side Pane Tab, and collapsed category launcher terminology.
- Files, Browser, and Terminal internal tab strips must migrate into the Side Pane tab model.
- Browser `WebContentsView` ownership and Terminal PTY ownership remain unchanged; their opaque resource ids become Side Pane tab payloads.
- Files explorer state must be independent of any one file tab and must survive switching among Files tabs and other categories.
- Side Pane tab restoration becomes a shared shell responsibility, while each category remains responsible for its resource-specific restore semantics.
- Closing dirty Files tabs, live Terminal tabs, or Git Diff tabs with unsaved buffers still uses the owning category's safety policy.
- The existing `files`, `git`, `browser`, and `terminal` capability identities may remain useful internally, but they no longer mean one selected Tool Pane Tool.
- Incremental delivery requires migration rules for previously persisted Tool Pane and tool-internal tab state.

## Alternatives Considered

- Keep one selected Tool Pane Tool with internal tabs — rejected because it hides open resources behind a second navigation layer.
- Add Side Pane tabs while retaining Browser, Terminal, and Files internal tabs — rejected because nested peer tab systems are harder to scan and operate.
- Give every Files tab an independent explorer model — rejected because explorer expansion, search, layout, and selection describe the context, not one file.
- Remove the collapsed launcher entirely — rejected because builders still need a compact way to reopen the most recent category or create its first tab.

## Review Trigger

Revisit if a single Side Pane tab strip becomes unmanageable with realistic tab counts, if flattened Browser or Terminal tabs materially harm category-specific workflows, if shared Files explorer state causes confusing selection behavior, or if builders need multiple independently laid-out editor groups rather than one context-scoped Side Pane.
