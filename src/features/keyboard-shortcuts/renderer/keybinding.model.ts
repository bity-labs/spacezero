export interface Keybinding {
  /** Normalized single-stroke keybinding such as `mod+k` or `alt+enter`. */
  normalized: string
}

export type KeybindingModifier = 'mod' | 'shift' | 'alt' | 'ctrl'

/**
 * Context used to evaluate context-aware (`when`) shortcuts.
 *
 * v0 starts with a small set of flags. Future versions may grow this into
 * richer context expressions similar to editor `when` clauses.
 */
export interface ShortcutContext {
  textInputFocused: boolean
  commandPaletteOpen: boolean
  terminalFocused: boolean
  browserFocused: boolean
  previewFocused: boolean
  editorFocused: boolean
}

export function createDefaultShortcutContext(): ShortcutContext {
  return {
    textInputFocused: false,
    commandPaletteOpen: false,
    terminalFocused: false,
    browserFocused: false,
    previewFocused: false,
    editorFocused: false
  }
}
