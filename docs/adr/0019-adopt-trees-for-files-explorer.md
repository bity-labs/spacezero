---
title: Adopt Trees for the Files Explorer
---

## Status

Accepted

## Supersession Note

ADR 0022 moves Files tabs into the Side Pane while retaining one shared Trees explorer model per context. ADR 0023 supersedes references to Monaco source models. Trees' renderer-only explorer role and the main-owned filesystem boundary remain accepted.

## Context

ADR 0015 selected a composable Files architecture: Space Zero owns product state and main-owned filesystem services, while renderer libraries provide focused UI foundations. It named `react-arborist` as the controlled, virtualized file-tree foundation and `material-icon-theme` as the source for detailed file icons.

Trees (`@pierre/trees`) now provides a path-first file explorer model with React integration, virtualization, selection/focus, search visibility, rename and drag/drop gestures, context-menu surfaces, built-in icon sets, compact folder behavior, Git-like row signals, and large-tree prepared-input guidance.

Space Zero wants to use more of that file-explorer model directly instead of maintaining separate renderer tree, icon, search, and interaction glue. At the same time, the existing Electron security and Files boundaries remain non-negotiable:

- renderer code must not receive raw filesystem authority;
- all file reads and mutations must route through typed preload/IPC APIs into main-owned services;
- Space Zero must preserve authenticated Project Session and Knowledge Base context roots;
- `.git` protection, symlink policy, path containment, search limits, trash behavior, optimistic revisions, and dirty-tab conflict handling remain Space Zero product rules; and
- Files remains a lightweight manual editing surface, not a full IDE workbench.

## Decision

The project uses Trees (`@pierre/trees`) as the renderer-only file explorer interaction and model foundation for Files.

Trees replaces the previously selected `react-arborist` tree foundation and the `material-icon-theme` icon pipeline. The implementation will remove both old dependencies and pin `@pierre/trees` to an exact version while it is beta.

Space Zero will use Trees for:

- the path-first explorer model;
- virtualization and visible-row management;
- selection and focus;
- default **Files search** that filters the tree by canonical path/name using Trees' `hide-non-matches` mode;
- inline rename;
- drag-and-drop move, disabled while Files search is active;
- context-menu surfaces opened by right-click or a subtle row hover trigger button;
- compact single-child folder chains, always on in v0;
- compact density and sticky folders;
- the broad built-in icon set with targeted Space Zero remaps only where needed;
- theme styling derived from Space Zero/editor theme variables where possible;
- always-visible read-only Git status decorations in both Project Session and Knowledge Base Files, using Trees' Git-like row signals; and
- critical filesystem policy row annotations, such as symlink, protected/locked, or open-tab conflict states.

For large trees, Space Zero follows Trees' prepared-input guidance. Main or another non-UI boundary loads canonical paths, applies Space Zero exclusions and ordering, and passes prepared or presorted input to the renderer rather than doing expensive tree shaping in UI code.

Space Zero still owns the Files product and security boundary:

- main owns filesystem reads, writes, directory/path preparation, search over file contents, file watching, optimistic revisions, metadata, create, rename/move, Trash, Reveal, canonical containment, `.git` protection, symlink policy, and Git status data collection;
- preload exposes only narrow typed APIs;
- renderer code passes canonical context-relative paths and callbacks into Trees;
- editor tabs, preview/permanent tab semantics, dirty buffers, save behavior, restoration, external-change conflicts, Markdown/MDX editor routing, Monaco models, and Tool Pane context isolation remain Space Zero-owned; and
- Files never stages, unstages, reverts, commits, checks out, or invokes Git workflow mutations.

Contents search remains separate from Trees. The explorer has two search modes: **Files search**, the default, uses Trees to filter path/name rows; **Contents search** uses Space Zero's main-owned search service and renders file/line/context match results.

## Rationale

Trees matches the direction of Files better than a lower-level generic tree primitive. It supplies a file-explorer-specific path-first model and common file-management interactions that Space Zero would otherwise keep assembling and maintaining around `react-arborist`.

Using Trees more deeply should reduce custom renderer glue for tree state, search visibility, context menus, rename, drag/drop, compact folders, density, sticky folders, icons, theme mapping, and row signals. Its canonical-path identity also aligns with Space Zero's context-relative IPC contracts.

The tradeoff is adopting a beta dependency and allowing a third-party model to shape more renderer explorer state. That risk is contained by keeping privileged file operations, root identity, policy, persistence, editor state, and IPC contracts Space Zero-owned. Trees can own interaction mechanics without owning filesystem authority or product semantics.

Git status decorations are accepted in Files because Trees provides a lightweight read-only row-signal lane. The boundary remains that Files may show status but does not perform Git workflow mutations; Git still owns diff review, staging, recovery, commit, branch, and PR workflows.

Prepared input is preferred over lazy UI shaping because Trees explicitly recommends moving large-tree preparation outside the UI. This keeps renderer work predictable while still allowing Space Zero main services to enforce exclusions, ordering, `.git` protection, and context containment before data reaches the renderer.

## Consequences

- ADR 0015 remains valid for the broader Files architecture, but this ADR supersedes its choice of `react-arborist` and `material-icon-theme` for the explorer.
- `react-arborist` and `material-icon-theme` should be removed when the Trees migration lands.
- `@pierre/trees` should be added with an exact version pin while beta.
- Existing Files explorer components, stores, tests, and adapters must migrate to Trees' path-first model.
- Main or another non-UI boundary must prepare or presort canonical path input for large trees.
- Git status collection must become available to both Project Session and Knowledge Base Files as read-only row decoration data.
- The renderer must treat Trees as a UI/model dependency only; Trees types and implementation details should not leak into shared IPC contracts or main services.
- Tests should cover the Space Zero-owned boundary: IPC calls for rename/move/search/content operations, dirty-tab protection before mutation, `.git` and symlink policy, context isolation, and Git status decoration data flow.

## Alternatives Considered

- Keep `react-arborist` and `material-icon-theme` — rejected because Trees provides more file-explorer-specific behavior in one path-first model, reducing custom renderer glue.
- Run a timeboxed spike before adoption — rejected in favor of direct adoption because the desired direction is to use Trees' way of doing file explorer interactions rather than merely evaluate it.
- Use Trees only as an adapter behind existing renderer state — rejected because it would preserve much of the existing complexity and underuse Trees' model.
- Use Trees for browsing only but keep mutation interactions in menus/dialogs — rejected because inline rename, drag/drop move, and right-click context menus are part of the desired file-management experience.
- Keep Files free of Git status decorations — rejected because Trees provides Git-like row signals and read-only status visibility is useful in both Project Session and Knowledge Base repositories.

## Review Trigger

Revisit this decision if Trees' beta API churn creates excessive maintenance, if bundle size or styling constraints become unacceptable, if accessibility or keyboard behavior regresses, if prepared input cannot handle large real repositories efficiently, if Git status decorations add confusing noise, or if Trees' model pressures Space Zero to weaken main-owned filesystem authority or context isolation.
