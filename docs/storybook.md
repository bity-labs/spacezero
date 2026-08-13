# Local Storybook Prototype Workflow

Storybook is Space Zero's local workbench for UI prototypes and design-system contracts. It renders real renderer components without launching the Electron application.

## Run Storybook locally

Install dependencies, then start the local workbench:

```bash
pnpm storybook
```

Use the story browser that opens locally to find a story by its title and exported story name. Storybook is local-only; tickets should reference story names and the command above rather than a hosted URL.

## Keep stories with real application UI

Stories must import real components from application source. Do not copy or duplicate UI code in a story or in a separate Storybook-only component tree. Build the component or pure screen in its normal application location, then import it into the story.

Co-locate each `*.stories.tsx` file with the component or screen it documents. For example:

```txt
src/renderer/src/components/ui/button.tsx
src/renderer/src/components/ui/button.stories.tsx

src/features/settings/renderer/screens/general-settings-screen.tsx
src/features/settings/renderer/screens/general-settings-screen.stories.tsx
```

Stories may supply simple fixture props and no-op callbacks to represent a visual state. A screen that also needs application behavior should keep that behavior in its app container and expose a pure screen component for the story.

## Keep Storybook separate from application integration

Storybook defines and exercises visual UI contracts. It is not the Electron application or an integration runtime. Stories must not depend on Electron, preload APIs, `window.spacezero`, IPC, SQLite, the filesystem, Git, GitHub, terminals, or agent runtime behavior.

Test Electron, preload, and IPC behavior through the application and its integration tests. A story can demonstrate how a component looks with mocked visual data, but it does not prove that application data loads, persists, or crosses a process boundary correctly.

## Reference stories from prototype and implementation tickets

A prototype ticket may add or update real UI components, pure screens, fixtures, and their co-located Storybook stories. Record the accepted visual contract in the ticket with the local story path and startup command. For example:

```md
Storybook reference:

- `Screens/Settings/General/Default`
- Run locally with `pnpm storybook`
```

In this example, `Screens/Settings/General` is the story title and `Default` is the exported story name.

An implementation ticket should not touch Storybook when it only wires existing UI to Electron, preload, IPC, persistence, or other application behavior. It should add or update a story only when the ticket intentionally changes the UI contract. Application behavior still requires the appropriate unit, renderer, or integration coverage; stories are not a replacement for those tests.
