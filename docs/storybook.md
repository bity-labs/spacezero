# Local Storybook Workflow

Storybook is Space Zero's local workbench for UI prototypes and visual contracts. It renders real renderer components without launching Electron.

Use the global toolbar to review any story with the real Space Zero light, dark, or dark-high-contrast theme tokens and any supported app font. Storybook defaults to the product's dark theme and system font; toolbar choices apply to the preview document without reading or persisting desktop appearance settings.

## Run Storybook locally

Install dependencies, then start the local workbench:

```bash
pnpm storybook
```

Use the local story browser to find a story by its title and exported story name. Storybook is local-only; tickets should reference story names and the command above rather than a hosted URL.

Before submitting Storybook work, run:

```bash
pnpm storybook:check
pnpm storybook:build
```

`storybook:build` runs the guardrail check before producing the static build.

## Use real pure views

Stories must import real components from application source. Do not copy UI into a story or a separate Storybook-only component tree.

Follow ADR 0024 when a renderer surface needs application behavior:

- a container, page, hook, or renderer client owns `window.spacezero`, routing, stores, subscriptions, persistence, commands, and other side effects;
- a pure `*-screen.tsx` or `*-view.tsx` receives visual state through props and emits user intent through callbacks;
- the story renders the pure screen or view with fixture props.

A component that is already small and pure does not need a new wrapper or container solely for Storybook.

## Co-locate stories and fixtures

Keep stories, fixtures, and their application component together:

```txt
src/features/projects/renderer/screens/
├── project-home-container.tsx
├── project-home-screen.tsx
├── project-home-screen.fixtures.ts
└── project-home-screen.stories.tsx
```

Use these naming conventions:

| File                              | Purpose                                                  |
| --------------------------------- | -------------------------------------------------------- |
| `*-container.tsx` or `*-page.tsx` | App-connected behavior and runtime state mapping.        |
| `*-screen.tsx` or `*-view.tsx`    | Pure visual surface used by the app and Storybook.       |
| `*.fixtures.ts`                   | Reusable serializable visual data and prop objects.      |
| `*.fixtures.tsx`                  | Reusable visual fixtures that intentionally contain JSX. |
| `*.stories.tsx`                   | Focused stories for the real component or pure screen.   |

A fixture should describe a meaningful visual state such as empty, loading, error, connected, running, or busy. Keep it deterministic and browser-safe: no network calls, timers, preload calls, filesystem access, or hidden app setup. Prefer named exports so tests and related stories can reuse the same state. Keep one-off callbacks or tiny values in the story when extracting them would not improve reuse.

## Apply the intent-based taxonomy

Use the story title to communicate why the UI exists, not its source folder:

| Intent                                      | Title examples                                                                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Generic primitives                          | `Design System/Primitives/Button`                                                                                                |
| Reusable composed components                | `Design System/Components/Agent Chat`, `Design System/Components/Rich Markdown Editor`                                            |
| Application shell components                | `App Shell/Components/Workspace Sidebar`, `App Shell/Components/Side Pane`, `App Shell/Components/Side Pane Tabs`                 |
| Application shell layouts                   | `App Shell/Layouts/Workspace Shell`                                                                                               |
| Feature-owned building blocks               | `Features/Settings/Components/Row`, `Features/Projects/Components/Project Sidebar List`                                           |
| Feature-owned screens                       | `Features/Settings/Screens/General`, `Features/Projects/Screens/Project Home`                                                     |
| Feature-owned layouts                       | `Features/Settings/Layouts/Settings Shell`                                                                                        |
| App-level or cross-feature screens          | `Screens/Global Chat`, `Screens/Project Session`, `Screens/Onboarding/Flow`                                                       |

Use the same pattern for Files, Git, Browser, Terminal, Knowledge Base, Onboarding, and other whole-app areas. Avoid catch-all titles such as `Smoke/*` for visual contracts that fit one of these intent groups. `pnpm storybook:check` rejects `Smoke/*`, unknown top-level groups, and story files without a static intent-based title.

The Storybook sidebar is intentionally sorted for review flow, not alphabetically:

1. `Design System` — primitives first, then reusable composed components
2. `App Shell` — shell components, then shell layouts
3. `Features` — each feature groups components, screens, and layouts
4. `Screens` — app-level or cross-feature screens that do not belong to one feature module

Build coverage in this order:

1. feature or design-system building blocks;
2. pure screens and views;
3. layout compositions;
4. important state variants.

## Keep Storybook separate from application integration

Ordinary visual stories must not call or require `window.spacezero`. They also must not depend on Electron, preload APIs, IPC, SQLite, the filesystem, Git, GitHub, browser webcontents, terminal processes, or agent runtime behavior. Do not mock the preload bridge to avoid a container/view split.

`pnpm storybook:check` scans `src/**/*.stories.{js,jsx,mjs,ts,tsx}` and fails when a story directly references `window.spacezero`, including bracket notation. The check is intentionally lightweight; reviewers must still reject indirect runtime dependencies imported through app-connected components.

Test runtime behavior through the appropriate unit, renderer, IPC, or end-to-end tests. Stories demonstrate visual states; they do not prove that data loads, persists, or crosses a process boundary correctly.

## Reference stories from tickets

Record an accepted visual contract with the local story title, exported story name, and startup command:

```md
Storybook reference:

- `App Shell/Layouts/Workspace Shell`
- Run locally with `pnpm storybook`
```

An implementation ticket that only wires an existing visual contract to Electron, preload, IPC, or persistence should not change Storybook. Add or update stories when the ticket intentionally changes the visual contract.
