---
title: Use composable renderer libraries and main-owned services for Files
---

## Status

Accepted

## Context

Space Zero needs one shared Files Tool for Project Sessions and the Knowledge Base. Project Session Files operates on an authenticated managed worktree, while Knowledge Base Files operates on its verified repository. Ordinary Workspace Sessions do not expose Files.

The tool needs editor-grade source editing, Markdown/MDX WYSIWYG editing, a virtualized accessible tree, detailed file icons, multi-file tabs, explicit save, restoration, search, file operations, and external-change detection. It must provide these behaviors without turning Space Zero into a complete IDE workbench or exposing filesystem authority to the renderer.

A full VS Code-derived workbench would duplicate and compete with Space Zero's Tool Pane, App Command, context identity, and process-boundary architecture. An all-in-one React editor package would instead make third-party state and filesystem abstractions the owner of product rules such as context isolation, dirty buffers, save conflicts, restart restoration, and the Files/Git boundary.

This decision builds on:

- ADR 0002 for secure Electron process boundaries and typed IPC;
- ADR 0004 for process-aware feature modules;
- ADR 0008 for renderer-owned UI/view state in Zustand;
- ADR 0013 for authenticated managed Project Session worktrees; and
- PRD #157 for the shared Files behavior.

## Decision

The shared Files Tool uses composable renderer libraries behind Space Zero-owned product state and main-process filesystem services:

- Monaco through `@monaco-editor/react` is the source/code editor engine.
- The existing Tiptap-based WYSIWYG editor remains the default editor for Markdown and MDX, with Monaco as source mode and lossless fallback.
- `react-arborist` is the controlled, virtualized file-tree interaction and accessibility foundation.
- The open-source `material-icon-theme` package supplies build-time filename/extension mappings and SVG assets; Space Zero owns deterministic icon resolution, rendering, and fallbacks.
- Space Zero owns editor tabs, preview/permanent state, dirty buffers, explicit save, editor-mode routing, view-state restoration, search presentation, external-change conflict behavior, and context isolation.
- Renderer-owned saved layout and working-set references use named Zustand state consistent with ADR 0008. Unsaved file content remains memory-only in v0.

Filesystem authority remains in Electron main:

- renderer calls use typed APIs exposed through `window.spacezero`;
- requests identify an authenticated Files context and context-relative path, never a renderer-selected root;
- main resolves the persisted managed worktree or verified Knowledge Base repository for every operation;
- main owns reads, writes, optimistic revisions, directory listing, search, file watching, metadata, create, rename/move, operating-system Trash, Reveal, canonical containment, `.git` protection, and symlink policy; and
- renderer libraries receive content and controlled tree data only. They receive no Node.js, Electron, raw IPC, or filesystem capability.

Files is implemented as one process-aware feature with shared contracts and context adapters, not separate Project Session and Knowledge Base tool implementations.

## Rationale

Monaco supplies the mature source-editor model closest to the Cursor/VS Code editing reference. Its URI-keyed models and view state fit context-scoped multi-file tabs without importing the rest of the VS Code workbench.

The existing Tiptap editor already provides Space Zero's Knowledge Base WYSIWYG behavior and lossless-representation checks. Reusing it for Markdown/MDX in both Files contexts keeps one product editing model while retaining Monaco for exact source work.

`react-arborist` supplies difficult generic tree mechanics—virtualization, keyboard navigation, ARIA behavior, inline rename, selection, and drag/drop—while allowing Space Zero to control data and operations. Material Icon Theme provides broad recognizable file coverage without making an icon library the owner of tree behavior.

Keeping tab, save, conflict, and restoration policy in Space Zero prevents volatile library APIs from becoming product contracts. Keeping filesystem behavior in main preserves the existing Electron security boundary and allows Project Session worktree authentication and Knowledge Base canonical-path rules to converge on one service contract.

## Consequences

- `monaco-editor`, `@monaco-editor/react`, `react-arborist`, and `material-icon-theme` become accepted Files dependencies and must be reviewed for packaging, bundle size, licensing, accessibility, and update behavior.
- Monaco workers and model disposal require explicit renderer lifecycle and build configuration.
- Monaco model identities must include the stable Files context identity so equal relative paths in different Sessions cannot share content, undo history, or view state.
- Space Zero must adapt existing WYSIWYG and Knowledge Base filesystem capabilities behind the shared Files contracts rather than importing Knowledge Base-specific state into the shared renderer.
- Tree, editor, and icon library types stay at the renderer edge and must not leak into shared IPC contracts or main services.
- File watching and long-lived editor state require explicit subscription, unsubscription, cleanup, and stale-revision behavior even when inactive tool components are unmounted.
- Renderer tests may fake Monaco, the tree, and `window.spacezero`; main tests can exercise filesystem behavior through service seams and temporary roots.
- A future replacement of any renderer library should not require changing Files product semantics or privileged service contracts.

## Alternatives Considered

- Embed or derive from the VS Code, VSCodium, Eclipse Theia, or OpenSumi workbench — rejected because it would introduce a competing application shell, command model, extension/runtime architecture, and process boundary for a tool intended to remain one contextual Space Zero surface.
- Use CodeMirror 6 as demonstrated by Jean — viable for lightweight source editing, but Monaco better matches the selected Cursor/VS Code editing reference and directly supports URI-keyed multi-model view state.
- Adopt `codepane` or another all-in-one React editor package — rejected because the package is immature and would couple Files product rules to third-party tab, dirty-buffer, persistence, watch, and filesystem-adapter behavior.
- Build the source editor and virtualized accessible tree from scratch — rejected because these are complex generic components without product differentiation.
- Expose filesystem paths or adapters directly to renderer libraries — rejected because it violates ADR 0002 and would bypass main-owned context authentication and path validation.

## Review Trigger

Revisit this decision if Monaco or `react-arborist` creates unacceptable startup, memory, accessibility, packaging, or maintenance costs; if Material Icon Theme materially inflates distribution size or becomes difficult to update safely; if Tiptap cannot support lossless Markdown/MDX workflows across both contexts; or if Files evolves into a full IDE where language servers, extensions, multiple editor groups, or cross-window editing require a broader platform decision.
