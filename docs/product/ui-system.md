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
- `packages/ui/src/components/`
- `apps/desktop/src/renderer/components/ui/`
- `apps/desktop/src/renderer/features/settings/components/`
- the co-located Storybook stories available through `pnpm storybook`

## Locked Defaults

- Default app theme: **Dark**.
- Default font: **System font**.
- Thin font anti-aliasing is **on by default**.
- Appearance settings are real product settings, not only workbench previews:
  - Theme: System, Light, Dark, Dark high contrast
  - Font: System font plus the available app font options
  - Font anti-aliasing: thin/browser-style rendering toggle
- `System` theme follows the OS color scheme. If the OS resolves dark, Space
  Zero uses regular `Dark`, not `Dark high contrast`.
- Dark high contrast is an explicit preference only.

Storybook is the local workbench for previewing primitives, typography, and
component patterns before broader rollout. `packages/ui` uses shadcn + Tailwind
CSS v4 with official Space Zero preset `b7BYR9Xec` (Vega/Mist, Phosphor icons,
Inter, medium radius). The generated preset CSS variables are authoritative;
do not approximate or replace them manually.

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
workflow containers. Cards do not need borders by default, but settings sections
may use a subtle border to define dense grouped rows.

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

- Cards do not have a default border everywhere.
- Settings row groups may use a subtle card border and row dividers.
- Inputs/selects usually need a visible border.
- Alerts may use a light border and subtle shadow.
- Dark high contrast uses stronger borders.

### Hover / active state

Token:

```css
--accent
```

Role:

> Hover, selected rows, active navigation, and ghost button hover.

Rule:

> Hover states must be visible in every theme.

### Focus state

Focus states should feel desktop-native, not like a web form halo.

Rules:

- Keep accessible `focus-visible` states.
- Do not use thick outer glow/ring focus treatments on primitives.
- Prefer a subtle semantic focus border such as `focus-visible:border-ring`.
- Do not replace focus treatment with arbitrary colors.

### Native scrollbars

Space Zero uses global native scrollbar styling rather than wrapping every scroll
area in a custom component. This keeps desktop scrolling behavior and gives the
app a consistent dense workbench feel.

## Primitive Usage Rules

Shared generic primitives live in:

```txt
packages/ui/src/components/
```

Import them through source-package subpath exports:

```ts
import "@spacezero/ui/globals.css";
import { Button } from "@spacezero/ui/components/button";
```

Legacy or renderer-local primitives may still exist in:

```txt
apps/desktop/src/renderer/components/ui/
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
- Use `EmptyState` for empty product areas with a title, short explanation, and
  one relevant action.

## Typography Components

Typography primitives live in:

```txt
apps/desktop/src/renderer/components/ui/typography.tsx
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

## Settings Patterns

Settings now provide the first real product application of this UI system.
Prefer the composed settings components for settings surfaces:

```txt
apps/desktop/src/renderer/features/settings/components/settings-page-header.tsx
apps/desktop/src/renderer/features/settings/components/settings-section.tsx
apps/desktop/src/renderer/features/settings/components/settings-row.tsx
```

Rules:

- Use `SettingsPageHeader` for the page title.
- Page headers should usually have only a title. Avoid subtitles unless the page
  truly needs extra context.
- `SettingsSection` groups rows inside a compact card. Its title and description
  are optional; omit the section title when it repeats the page title or creates
  visual noise.
- `SettingsSection` headers and cards align to the same left edge as the page
  title. Do not add extra horizontal inset around section headers.
- Use `SettingsRow` for dense settings controls and status rows.
- Put persistent actions in the relevant row when the action affects that row.
  Example: About → “Check for updates” belongs in the “Update state” row.
- Prefer outline buttons for secondary settings actions.
- Avoid unnecessary uppercase section labels in Settings.

Current Settings navigation order:

1. General
2. Providers
3. Account
4. Appearance
5. About
6. separator
7. Agents
8. Skills

### General

General owns language and product behavior preferences such as chat link handling
and Git primary action. Theme no longer lives in General.

### Account

Account owns Space Zero Account and GitHub App access status inside Desktop
Settings.

Rules:

- Use only the page title “Account”; do not add a page subtitle.
- Show account identity as a compact status row: email for email accounts or
  GitHub username when the account identity comes from GitHub, with avatar when
  available.
- Show current plan/entitlement state as a separate row.
- Show GitHub App repository access as its own row, distinct from Space Zero
  Account identity.
- The GitHub App row should preserve the existing v0 repository-management
  capability rather than becoming a shallow status-only row.
- The row should expose current access state, accessible repository status, and
  actions for the GitHub App/device-flow connection, opening installation
  management for selected repositories, explicit recheck, and disconnect when
  available.
- If no live installation query finds a usable repository, use the honest
  “Repository access required” state with manage and recheck actions. Do not
  invent a pending organization approval state.
- The App Sidebar account affordance should remain compact and link users toward
  Settings → Account for details rather than duplicating account management UI.

### Providers

The former “Models” settings page is now “Providers” because setup starts with
provider configuration.

Rules:

- Use `EmptyState` for subscription and API key empty states.
- Empty-state CTAs should include “Add new”.
- When configured entries exist, place the add action in the section footer as
  an outline button.
- Do not show API key testing controls.
- Do not show an “Available Models” section on this page.
- Do not show provider source badges such as “Stored”.
- Remove/trash actions should be icon-only with accessible labels.
- Default model picker rows should be clickable; do not use a separate “Use as
  default” button.
- Sort the current default model first.
- In model picker rows, the second line should show provider only and should not
  repeat the model id.

### Appearance

Appearance owns theme and typography.

Rules:

- Use only the page title “Appearance”; do not add a page subtitle.
- Do not add a redundant section title above the controls.
- Theme description: “Choose how Space Zero picks the app appearance.”
- Theme values: System, Light, Dark, Dark high contrast.
- Font selection uses the established app font options.
- Thin font anti-aliasing is checked by default and uses the regular settings
  switch size.
- All controls should be displayed through `SettingsSection` and `SettingsRow`.

### About

About uses the same compact row system as other Settings pages.

Rules:

- Use only the page title “About”; do not add a page subtitle.
- Do not add a redundant “About & Updates” section title.
- Do not show a Beta channel badge in the version row.
- Put “Check for updates” in the “Update state” row as an outline button.
- Do not show a GitHub release notes button in the main About settings surface.

## Workspace Layout Patterns

These are product-level patterns. They should be implemented as composed
components when real product screens show repeated needs.

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

- optional section title
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

Use `EmptyState` from:

```txt
apps/desktop/src/renderer/components/ui/empty.tsx
```

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

- Use shared primitives from `@spacezero/ui` when they exist, imported through component subpath exports.
- Use existing primitives from `apps/desktop/src/renderer/components/ui` only when no shared package primitive exists or the component is renderer-local.
- Use composed settings components for Settings pages.
- Use typography primitives instead of ad hoc text classes.
- Keep generic primitives domain-free.
- Do not create new one-off card/panel styles unless necessary.
- Prefer rows and panels over card stacks for dense workspace UI.
- Keep controls visible on card/panel surfaces.
- Avoid transparent inputs/selects unless there is a specific reason.
- Do not use arbitrary colors when a theme token exists, and do not invent replacements for the generated `b7BYR9Xec` shadcn preset variables.
- Use `EmptyState` for empty product states.
- Check the relevant Storybook stories when changing primitives or theme tokens.

## What Is Not Solved Yet

The current UI system is enough to start product work, but it is not final.

Still missing:

- Agent Work Session-specific components
- shared status component
- broader application of typography primitives across existing screens
- broader rollout of Settings patterns to non-settings workspace surfaces
- broader targeted screenshot-regression coverage beyond the mock-Host Electron screens required by ADR 0036
