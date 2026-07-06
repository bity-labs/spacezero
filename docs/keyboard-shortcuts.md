# Keyboard Shortcuts

Space Zero keyboard shortcuts are **in-app only** (v0) and resolve to stable
**App Command IDs**. They are not owned by the Command Palette; both the palette
and shortcuts dispatch through the same neutral App Command Registry.

## Architecture

```txt
Keyboard event
  -> KeyboardShortcutsProvider (global renderer listener)
  -> KeyboardShortcutManager
  -> normalized keybinding match
  -> context / when check
  -> App Command ID
  -> AppCommandRegistry
  -> command handler
  -> optional preload/IPC/main service for app-state/native behavior
```

## Adding a default shortcut

1. **Register the App Command** where the behavior/state lives.

   ```ts
   import { appCommandRegistry } from '@/features/app-commands/renderer/app-command-registry'

   useEffect(() => {
     const unregister = appCommandRegistry.register({
       id: 'myFeature.doThing',
       title: 'Do thing',
       category: 'My Feature',
       handler: () => {
         // mutate renderer state or call window.spacezero.* for main behavior
       }
     })
     return unregister
   }, [])
   ```

2. **Register the default keybinding** with the shortcut manager.

   ```ts
   import { keyboardShortcutManager } from '@/features/keyboard-shortcuts/renderer/keyboard-shortcut-manager'

   useEffect(() => {
     const unregister = keyboardShortcutManager.register({
       commandId: 'myFeature.doThing',
       defaultKeybinding: { normalized: 'mod+shift+t' }
     })
     return unregister
   }, [])
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
keyboardShortcutManager.setUserOverride('myFeature.doThing', { normalized: 'alt+t' })
keyboardShortcutManager.setUserOverride('myFeature.doThing', null) // restore default
```

Future settings UI can persist these overrides and replay them on app start.

## Current default shortcuts

| Command ID | Default keybinding | Behavior |
| --- | --- | --- |
| `workspace.toggleLeftSidebar` | `mod+b` | Toggle the left sidebar |
| `workspace.toggleRightSidebar` | `mod+shift+b` | Toggle the right sidebar |
