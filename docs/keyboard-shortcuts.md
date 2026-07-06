# Keyboard Shortcuts

Space Zero keyboard shortcuts are **in-app only** (v0) and resolve to stable
**App Command IDs**. They are not owned by the Command Palette; both the palette
and shortcuts dispatch through the same `AppCommandRegistry` provided by
`AppCommandProvider`.

## Architecture

```txt
Keyboard event
  -> KeyboardShortcutsProvider (global renderer listener)
  -> KeyboardShortcutManager
  -> normalized keybinding match
  -> context / when check
  -> App Command ID
  -> AppCommandRegistry.invoke(commandId, invocationContext)
  -> command handler
  -> optional preload/IPC/main service for app-state/native behavior
```

`AppCommandProvider` owns the registry and the invocation context (the narrow
`window.spacezero` API). `KeyboardShortcutsProvider` reads both from context and
attaches the global keydown listener.

## Adding a default shortcut

1. **Register the App Command** where the behavior/state lives.

   ```ts
   import { useRegisterAppCommands } from '@/features/app-commands/renderer/app-command-context'
   import type { AppCommand } from '@/features/app-commands/renderer/app-command.model'

   const myCommands: readonly AppCommand[] = [
     {
       id: 'myFeature.doThing',
       title: 'Do thing',
       category: 'My Feature',
       handler: () => {
         // mutate renderer state or call context.spacezero.* for main behavior
       }
     }
   ]

   function MyFeature(): React.JSX.Element {
     useRegisterAppCommands(myCommands)
     // ...
   }
   ```

2. **Register the default keybinding** with the shortcut manager.

   ```ts
   import type { KeyboardShortcutDefinition } from '@/features/keyboard-shortcuts/renderer/keyboard-shortcut-manager'
   import { useRegisterKeyboardShortcuts } from '@/features/keyboard-shortcuts/renderer/keyboard-shortcut-provider'

   const myShortcuts: readonly KeyboardShortcutDefinition[] = [
     { commandId: 'myFeature.doThing', defaultKeybinding: { normalized: 'mod+shift+t' } }
   ]

   function MyFeature(): React.JSX.Element {
     useRegisterAppCommands(myCommands)
     useRegisterKeyboardShortcuts(myShortcuts)
     // ...
   }
   ```

3. **Gate the shortcut** when needed:

   - `allowInTextInput: true` lets the shortcut fire while typing.
   - `when: (ctx) => ...` enables context-aware activation using the v0 context
     flags (`textInputFocused`, `commandPaletteOpen`, `terminalFocused`,
     `previewFocused`, `editorFocused`).

## Keybinding syntax

Single-stroke shortcuts use normalized tokens:

| Example | Meaning |
| --- | --- |
| `mod+k` | Command+k on macOS, Control+k on Windows/Linux |
| `mod+shift+p` | Command+Shift+p / Control+Shift+p |
| `mod+,` | Command+, / Control+, |
| `alt+enter` | Alt+Enter |
| `escape` | Escape |

`mod` is the only platform-aware modifier. `ctrl`, `alt`, and `shift` are matched
literally.

## User overrides

The manager supports per-command user overrides:

```ts
const manager = useKeyboardShortcutsManager()
manager.setUserOverride('myFeature.doThing', { normalized: 'alt+t' })
manager.setUserOverride('myFeature.doThing', null) // restore default
```

Future settings UI can persist these overrides and replay them on app start.

## Current default shortcuts

| Command ID | Default keybinding | Behavior |
| --- | --- | --- |
| `workspace.toggle-left-panel` | `mod+b` | Toggle the left sidebar |
| `workspace.toggle-right-panel` | `mod+shift+b` | Toggle the right sidebar |
