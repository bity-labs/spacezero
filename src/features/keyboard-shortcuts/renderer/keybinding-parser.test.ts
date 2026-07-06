import { beforeEach, describe, expect, it } from 'vitest'

import {
  isTextInputElement,
  matchKeyboardEvent,
  parseKeybinding,
  toPlatformDisplayLabel
} from './keybinding-parser'

function stubPlatform(platform: string): void {
  Object.defineProperty(window.navigator, 'platform', {
    value: platform,
    configurable: true
  })
}

describe('parseKeybinding', () => {
  it('parses a simple key', () => {
    const parsed = parseKeybinding({ normalized: 'escape' })

    expect(parsed).toEqual({ key: 'escape', mod: false, shift: false, alt: false, ctrl: false })
  })

  it('parses mod+k', () => {
    const parsed = parseKeybinding({ normalized: 'mod+k' })

    expect(parsed).toEqual({ key: 'k', mod: true, shift: false, alt: false, ctrl: false })
  })

  it('parses mod+shift+p', () => {
    const parsed = parseKeybinding({ normalized: 'mod+shift+p' })

    expect(parsed).toEqual({ key: 'p', mod: true, shift: true, alt: false, ctrl: false })
  })

  it('parses mod+,', () => {
    const parsed = parseKeybinding({ normalized: 'mod+,' })

    expect(parsed).toEqual({ key: ',', mod: true, shift: false, alt: false, ctrl: false })
  })

  it('parses alt+enter', () => {
    const parsed = parseKeybinding({ normalized: 'alt+enter' })

    expect(parsed).toEqual({ key: 'enter', mod: false, shift: false, alt: true, ctrl: false })
  })

  it('throws on empty binding', () => {
    expect(() => parseKeybinding({ normalized: '' })).toThrow()
  })

  it('throws on unknown modifier', () => {
    expect(() => parseKeybinding({ normalized: 'cmd+k' })).toThrow()
  })
})

describe('matchKeyboardEvent', () => {
  beforeEach(() => {
    stubPlatform('MacIntel')
  })

  it('matches mod+k with Command on macOS', () => {
    const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true })

    expect(matchKeyboardEvent(event, { normalized: 'mod+k' })).toBe(true)
  })

  it('matches mod+k with Control on Windows/Linux', () => {
    stubPlatform('Win32')
    const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true })

    expect(matchKeyboardEvent(event, { normalized: 'mod+k' })).toBe(true)
  })

  it('does not match mod+k with Control on macOS', () => {
    const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true })

    expect(matchKeyboardEvent(event, { normalized: 'mod+k' })).toBe(false)
  })

  it('matches shift+alt+p', () => {
    const event = new KeyboardEvent('keydown', { key: 'p', shiftKey: true, altKey: true })

    expect(matchKeyboardEvent(event, { normalized: 'alt+shift+p' })).toBe(true)
  })

  it('is case-insensitive for letter keys', () => {
    const event = new KeyboardEvent('keydown', { key: 'K', metaKey: true, shiftKey: true })

    expect(matchKeyboardEvent(event, { normalized: 'mod+shift+k' })).toBe(true)
  })

  it('requires exact modifier state', () => {
    const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true, shiftKey: true })

    expect(matchKeyboardEvent(event, { normalized: 'mod+k' })).toBe(false)
  })
})

describe('toPlatformDisplayLabel', () => {
  it('renders macOS labels without separators', () => {
    stubPlatform('MacIntel')

    expect(toPlatformDisplayLabel({ normalized: 'mod+shift+p' })).toBe('⌘⇧P')
  })

  it('renders non-macOS labels with + separators', () => {
    stubPlatform('Linux x86_64')

    expect(toPlatformDisplayLabel({ normalized: 'mod+shift+p' })).toBe('Ctrl+Shift+P')
  })
})

describe('isTextInputElement', () => {
  it('detects input elements', () => {
    const input = document.createElement('input')

    expect(isTextInputElement(input)).toBe(true)
  })

  it('detects textarea elements', () => {
    const textarea = document.createElement('textarea')

    expect(isTextInputElement(textarea)).toBe(true)
  })

  it('detects contenteditable elements', () => {
    const div = document.createElement('div')
    div.setAttribute('contenteditable', 'true')

    expect(isTextInputElement(div)).toBe(true)
  })

  it('detects contenteditable="" elements', () => {
    const div = document.createElement('div')
    div.setAttribute('contenteditable', '')

    expect(isTextInputElement(div)).toBe(true)
  })

  it('ignores non-editable elements', () => {
    const div = document.createElement('div')

    expect(isTextInputElement(div)).toBe(false)
  })

  it('treats contenteditable="false" as non-editable', () => {
    const div = document.createElement('div')
    div.setAttribute('contenteditable', 'false')

    expect(isTextInputElement(div)).toBe(false)
  })
})
