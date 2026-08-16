---
title: Use Diffs Edit for source and Git diff editing
---

## Status

Accepted

## Context

ADR 0015 selected Monaco as the Files source editor while keeping tabs, dirty buffers, save behavior, restoration, conflicts, and filesystem authority in Space Zero. ADR 0017 selected `@pierre/diffs` for read-oriented Git review and initially kept Git diffs view-only.

Space Zero now uses Trees from Pierre for the Files explorer and Diffs for Git review. Diffs Edit adds editing to `File`, `FileDiff`, and virtualized `CodeView` surfaces with syntax highlighting, multiple cursors, find/replace, undo/redo, markers, programmatic edits, custom keymaps, focus callbacks, explicit editor state, per-file persistent state, accessibility, and Electron clipboard integration.

The Files product remains a lightweight manual editing surface rather than a complete IDE. The current product contract does not require Monaco-specific IntelliSense, hover, language-service diagnostics, symbol navigation, or formatting. Using one code-surface library for ordinary source files and editable Git diffs can reduce lifecycle and visual differences, provided Space Zero remains the owner of product state and privileged operations.

Diffs Edit is documented as experimental, so the integration must contain its API at the renderer edge and preserve replaceability.

## Decision

Space Zero uses `@pierre/diffs` Edit as the source editor in Files and as the editable new-file side of Git Diff. This supersedes ADR 0015's choice of Monaco and ADR 0017's view-only restriction for diff contents; their broader Files-service and agent-assisted Git-mutation boundaries remain accepted.

The migration preserves every existing Files behavior compatible with Diffs Edit, including:

- syntax-highlighted text and plain-text fallback;
- controlled content changes;
- multiple cursors and selections;
- find and replace;
- undo and redo;
- programmatic edits on the same undo timeline;
- custom keyboard behavior and explicit save integration;
- cursor, selection, horizontal scroll, and vertical scroll restoration;
- focusing a requested line and character;
- markers for externally supplied diagnostics;
- focus and blur reporting;
- virtualized large-file rendering within Space Zero's existing file-size policy;
- accessible editable code surfaces; and
- a narrow Electron clipboard adapter behind Space Zero's secure preload/main boundary when native clipboard behavior is required.

Space Zero owns document identity and product state:

- each editable document uses a unique stable identity containing its workspace-context identity and canonical relative path;
- Space Zero remains authoritative for tabs, preview/permanent state, dirty buffers, save/save-all, optimistic revisions, external-change conflicts, restoration policy, and filesystem IPC;
- Diffs types and editor instances remain renderer implementation details and do not enter shared IPC or main services;
- changing a file's external revision or replacing its canonical content establishes a new editor baseline rather than allowing stale cached content to win; and
- rename and move operations migrate Space Zero document identity and compatible editor state deliberately rather than relying on a provider cache key as a product identifier.

Markdown and MDX open in **Source** mode by default so every file begins in the common source-editing path. A Files tab may replace the Diffs source editor with the existing rich Markdown editor in the same tab. **Source** and **Rich** are session-only modes: Rich selection is retained while the tab stays open during the app run but is not restored after restart. Switching modes saves the file first; a save failure or unresolved external-change conflict blocks the switch. Ordinary Side Pane tab changes, category changes, and context changes never auto-save. The two editor engines keep separate undo histories, and the destination engine starts from the saved file baseline.

Files and Git Diff share one Space Zero-owned dirty document buffer. Editing the new-file side of Git Diff:

- is available in **Uncommitted** and **Unstaged**, while **Staged** remains read-only because it represents index content;
- changes the same in-memory content a corresponding Files tab would show;
- does not save automatically and does not create a Files tab;
- shares the Diffs document and undo history with Files where the library lifecycle permits;
- keeps independent cursor, selection, and scroll state for normal-file and diff layouts; and
- continues comparing the editable side against the selected Git baseline while direct staging, discard/reset, commit, fetch/pull/rebase, push, and remote configuration remain outside renderer Git UI.

Markdown and MDX diff editing is disabled while the corresponding Files tab is in Rich mode. Git Diff remains readable and offers to focus that Files tab; the builder must save and switch it to Source before both Diffs surfaces may share editing history. This prevents stale rich-editor content from overwriting diff edits.

A dirty document edited only through Git Diff must remain visibly recoverable in that tab even when a filter change, refresh, or repository-state update would otherwise remove its diff. Git Diff keeps such documents in a pending-edits section until they are saved, discarded, or opened in Files.

Closing Git Diff prompts only for dirty documents that would lose their final editor surface. The choices are **Save and close**, **Discard and close**, and **Cancel**. The first two actions apply to all such orphaned dirty documents. Save failures or external-change conflicts keep Git Diff open, leave failed documents dirty, and report per-file errors; successful saves remain saved. Dirty documents still open in Files tabs remain visible and do not require that close prompt.

## Rationale

Diffs Edit matches the product's intended editor depth while unifying the visual and interaction foundation for file editing and diff correction. Its explicit state, persistent per-file documents, history, markers, virtualization, and focus APIs cover the current Files contract without importing a complete IDE workbench. Trees and Diffs also share a theming ecosystem, which should reduce duplicated renderer integration.

Space Zero-owned buffers and save policy prevent a volatile editor API from becoming the product model. Opening Markdown in Source gives every file a predictable common default, while retaining Rich only in memory avoids restoring a secondary engine unexpectedly. Saving before Source/Rich transitions avoids cross-engine live synchronization and ambiguous undo semantics. Sharing content and Diffs history between Files and Git Diff avoids competing unsaved versions while independent view state respects their different layouts.

The tradeoff is losing Monaco's bundled language-service capabilities and adopting an experimental editing API. Those capabilities are not part of the current product contract, and the risk is contained behind a Space Zero adapter and behavior-focused tests.

## Consequences

- `monaco-editor`, `@monaco-editor/react`, Monaco workers, virtual model URIs, and Monaco-specific view-state migration become removal candidates after parity is verified.
- The Diffs dependency must be upgraded to a release containing Edit and reviewed for packaging, bundle size, licensing, accessibility, Electron clipboard behavior, and API stability.
- The implementation needs a Space Zero adapter around `EditProvider`, `Editor`, file identities, state storage, line targeting, keymaps, and buffer synchronization.
- Existing tests should be rewritten around Files behavior rather than Monaco component identity.
- Product-contract parity is required before removing Monaco; Monaco-only IntelliSense and language-service behavior is not migration acceptance criteria.
- Diffs cannot compute diagnostics by itself; future lint or language-server integrations must supply markers.
- A requested line can be focused directly, but exact Monaco-style centering may require a small scroll adapter or may remain nearest-visible behavior.
- Git Diff becomes an editor of working content without becoming a direct Git mutation client.

## Alternatives Considered

- Keep Monaco for Files and use Diffs Edit only in Git Diff — rejected because it preserves two code-editing engines and prevents compatible shared document history.
- Require Monaco capability parity — rejected because IntelliSense and bundled language services exceed the lightweight manual editor contract.
- Keep Markdown rich/source modes live-synchronized without saving — rejected because two editor engines would need conflict-free shared history and baseline semantics.
- Let Diffs persistence own dirty buffers and restart restoration — rejected because product state, conflict policy, and filesystem authority must remain Space Zero-owned.
- Auto-save Git Diff edits — rejected because editing a diff should follow the same explicit-save policy as Files.

## Review Trigger

Revisit if Diffs Edit API churn creates excessive maintenance, typing or virtualization performance is unacceptable on the supported file-size range, accessibility regresses, Electron clipboard integration is unreliable, required editor behavior cannot be reproduced, builders demonstrate a need for IDE-grade language services, or shared Files/Git document history proves unstable.
