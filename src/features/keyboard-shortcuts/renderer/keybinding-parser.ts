import { Keybinding } from './keybinding.model'

export interface ParsedKeybinding {
  key: string
  mod: boolean
  shift: boolean
  alt: boolean
  ctrl: boolean
}

const validModifiers = new Set(['mod', 'shift', 'alt', 'ctrl'])

export function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
}

/**
 * Detect whether the currently focused element is a text input surface.
 *
 * Used by the shortcut manager to gate shortcuts while the user is typing.
 */
export function isTextInputElement(element: Element | null): boolean {
  if (!element) {
    return false
  }

  const tag = element.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea') {
    return true
  }

  if ((element as HTMLElement).isContentEditable) {
    return true
  }

  const contentEditable = element.getAttribute('contenteditable')
  return contentEditable === '' || contentEditable === 'true'
}

/**
 * Parse a normalized keybinding into its modifiers and main key.
 *
 * Examples:
 *   - `mod+k`
 *   - `mod+shift+p`
 *   - `mod+,`
 *   - `alt+enter`
 *   - `escape`
 */
export function parseKeybinding(binding: Keybinding): ParsedKeybinding {
  const tokens = binding.normalized.toLowerCase().split('+').map((token) => token.trim())
  const key = tokens.pop()

  if (!key) {
    throw new Error(`Invalid keybinding: "${binding.normalized}"`)
  }

  const parsed: ParsedKeybinding = {
    key,
    mod: false,
    shift: false,
    alt: false,
    ctrl: false
  }

  for (const token of tokens) {
    if (!validModifiers.has(token)) {
      throw new Error(`Unknown modifier "${token}" in keybinding: "${binding.normalized}"`)
    }
    parsed[token as keyof Omit<ParsedKeybinding, 'key'>] = true as never
  }

  return parsed
}

/**
 * Match a browser KeyboardEvent against a normalized keybinding.
 *
 * `mod` maps to Command on macOS and Control on Windows/Linux.
 */
export function matchKeyboardEvent(event: KeyboardEvent, binding: Keybinding): boolean {
  const parsed = parseKeybinding(binding)
  const isMac = isMacPlatform()

  if (isMac) {
    if (event.metaKey !== parsed.mod) {
      return false
    }
    if (event.ctrlKey !== parsed.ctrl) {
      return false
    }
  } else {
    // On non-macOS, `mod` maps to Control. If `mod` is present, Control is
    // already accounted for; checking it again would conflict with bindings
    // like `mod+k` while the user is holding Control.
    if (event.ctrlKey !== parsed.mod) {
      return false
    }
    if (!parsed.mod && event.ctrlKey !== parsed.ctrl) {
      return false
    }
  }

  if (event.shiftKey !== parsed.shift) {
    return false
  }

  if (event.altKey !== parsed.alt) {
    return false
  }

  return event.key.toLowerCase() === parsed.key
}

function formatKeyForDisplay(key: string): string {
  switch (key) {
    case 'arrowup':
      return '↑'
    case 'arrowdown':
      return '↓'
    case 'arrowleft':
      return '←'
    case 'arrowright':
      return '→'
    case 'enter':
      return '↵'
    case 'escape':
      return 'Esc'
    case 'tab':
      return '⇥'
    case ' ':
      return 'Space'
    default:
      return key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1)
  }
}

/**
 * Render a keybinding with platform-native labels.
 *
 * macOS:  ⌘⇧P
 * Others: Ctrl+Shift+P
 */
export function toPlatformDisplayLabel(binding: Keybinding): string {
  const parsed = parseKeybinding(binding)
  const isMac = isMacPlatform()
  const parts: string[] = []

  if (parsed.mod) {
    parts.push(isMac ? '⌘' : 'Ctrl')
  }

  if (parsed.alt) {
    parts.push(isMac ? '⌥' : 'Alt')
  }

  if (parsed.shift) {
    parts.push(isMac ? '⇧' : 'Shift')
  }

  if (parsed.ctrl && !parsed.mod) {
    parts.push('Ctrl')
  }

  parts.push(formatKeyForDisplay(parsed.key))

  return parts.join(isMac ? '' : '+')
}
