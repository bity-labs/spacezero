---
title: Space Zero UI System
---

# Space Zero UI System

## Purpose

Space Zero should feel like a compact desktop workbench for agentic software
building, not a generic web dashboard. The UI system exists to keep product
surfaces consistent, dense, calm, and easy for agents to extend without visual
drift.

Use this document with:

- `docs/product/workspace-surfaces.md`
- `src/renderer/src/components/ui/`
- Settings → UI Debug

## Locked Defaults

- Default app theme: **Dark**.
- Default font: **System font**.
- Theme choices should become real Appearance settings:
  - Light
  - Dark
  - Dark High Contrast
- Font choice should become part of Settings → Appearance.

The UI Debug page may expose experimental previews before they become real
settings.

## Visual Direction

Space Zero should feel:

- compact
- technical
- calm
- precise
- desktop-native
- readable during long agent sessions

Avoid a style that feels:

- oversized
- overly rounded
- card-heavy
- SaaS-dashboard-like
- marketing-page-like
- full of one-off Tailwind text and spacing choices

## Surface Hierarchy

Treat theme tokens as a visual ladder. Tune related tokens together instead of
moving one token at a time.

### Level 0 — App background

Token:

```css
--background
```

Role:

> The deepest app layer.

Use for the main workspace background and large empty areas. It should be calm
and not visually noisy.

### Level 1 — Panel / card background

Token:

```css
--card
```

Role:

> The main surface level above app background.

Use for panels, cards, grouped rows, settings sections, debug rows, and agent
workflow containers. Cards do not need borders by default.

### Level 2 — Nested / control background

Tokens:

```css
--input
--muted
--secondary
```

Role:

> Makes interactive controls and nested content visible inside panels/cards.

Rules:

- Inputs, selects, textareas, and input groups must remain visible on `--card`.
- Do not make controls transparent by default.
- Muted blocks should separate from the card background without becoming heavy.

### Level 3 — Popover / elevated background

Token:

```css
--popover
```

Role:

> Temporary elevated UI above the workspace.

Use for dropdowns, dialogs, sheets, command palettes, and similar overlays.

### Borders

Token:

```css
--border
```

Role:

> Separates panels and controls without creating heavy boxes everywhere.

Rules:

- Cards do not have a default border.
- Inputs/selects usually need a visible border.
- Alerts may use a light border and subtle shadow.
- Dark High Contrast uses stronger borders.

### Hover / active state

Token:

```css
--accent
```

Role:

> Hover, selected rows, active navigation, and ghost button hover.

Rule:

> Hover states must be visible in every theme.

## Primitive Usage Rules

Generic primitives live in:

```txt
src/renderer/src/components/ui/
```

They should remain domain-free. They must not know about projects, agents,
GitHub, sessions, SQLite, IPC, or Space Zero workflows.

Use primitives directly for generic UI, but introduce composed components when a
repeated product pattern appears.

Examples:

- Prefer `ButtonGroup` over manual connected button styling.
- Do not use `Card` as the answer for every container.
- Prefer rows for dense list-like content.
- Use `Alert` for notices, but let parent layout decide placement.
- Use `Input`, `Textarea`, `Select`, and `InputGroup` instead of ad hoc control
  styling.

## Typography Components

Typography primitives live in:

```txt
src/renderer/src/components/ui/typography.tsx
```

Use these instead of ad hoc text classes when creating product UI.

### `Heading`

#### `level="h1"`

Use for rare page-level titles or major standalone screens.

#### `level="h2"`

Use for main surface titles and settings/debug page titles.

#### `level="h3"`

Use for panel titles, card titles, and tool pane section titles.

#### `level="h4"`

Use for small section titles and dense workspace block titles.

#### `level="h5"` / `level="h6"`

Use for eyebrow labels, grouped list labels, and compact metadata headings. Use
sparingly because uppercase labels can become noisy.

### `Text`

#### `variant="body"`

Default readable body text.

#### `variant="muted"`

Secondary paragraph text and helper descriptions.

#### `variant="small"`

Dense row text, file rows, settings values, and compact metadata near labels.

#### `variant="subtle"`

Low-emphasis small text, helper copy, timestamps, and secondary row
descriptions.

#### `variant="meta"`

Very small metadata such as timestamps, file counts, and dense status details.

#### `variant="label"`

Form labels, row labels, and non-heading labels.

#### `variant="danger"`

Destructive, failed, or validation text. Danger text should not be larger than
body text; color carries the emphasis.

### `CodeText`

Use for inline commands, file paths, code identifiers, and similar references.

### `Kbd`

Use for keyboard shortcuts.

## Workspace Layout Patterns

These are product-level patterns. They should be implemented as composed
components only when the real product screens show repeated needs.

### Surface Header

Top area of a workspace surface.

Usually contains:

- title
- optional subtitle/metadata
- status
- primary actions

### Surface Section

Grouped content inside a surface.

Usually contains:

- section title
- optional description
- content rows

### Row

Default dense unit for list-like content.

Use rows for:

- files
- sessions
- settings
- checks
- commands
- tool activity
- changed files

Rule:

> If content is list-like, use rows, not cards.

### Panel

A larger work area inside the workspace.

Examples:

- agent timeline panel
- changed files panel
- review panel
- terminal output panel

Rule:

> Panels structure the workspace. Cards highlight objects.

### Empty State

Should include:

- clear title
- short explanation
- one primary action if relevant

Avoid large decorative illustrations until there is a strong product reason.

### Notice

Use `Alert` for notices, errors, and info states. Do not add arbitrary margins to
`Alert` itself; parent layout owns placement.

## Status Language

The minimal shared status set is:

```ts
type WorkStatus =
  | 'idle'
  | 'running'
  | 'waiting'
  | 'blocked'
  | 'failed'
  | 'done'
  | 'needs-review'
```

Meanings:

- `idle`: nothing active.
- `running`: active work is happening.
- `waiting`: waiting for output, tool completion, or external progress.
- `blocked`: user input or decision is required.
- `failed`: command, check, or task failed.
- `done`: work completed successfully.
- `needs-review`: work is complete but should be inspected by the builder.

A future `StatusPill` should map this language consistently across agent,
terminal, diff, and orchestration surfaces.

## Agent Guidance

When building UI:

- Use existing primitives from `src/renderer/src/components/ui`.
- Use typography primitives instead of ad hoc text classes.
- Keep generic primitives domain-free.
- Do not create new one-off card/panel styles unless necessary.
- Prefer rows and panels over card stacks for dense workspace UI.
- Keep controls visible on card/panel surfaces.
- Avoid transparent inputs/selects unless there is a specific reason.
- Do not use arbitrary colors when a theme token exists.
- Check Settings → UI Debug when changing primitives or theme tokens.

## What Is Not Solved Yet

The current UI system is enough to start product work, but it is not final.

Still missing:

- stable product-level surface components
- Agent Work Session-specific components
- shared status component
- final Appearance settings UI
- broader application of typography primitives across existing screens
- future visual regression/screenshot testing if needed
