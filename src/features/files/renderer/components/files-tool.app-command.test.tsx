import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppCommandProvider } from '../../../app-commands/renderer/app-command-context'
import { AppCommandRegistry } from '../../../app-commands/renderer/app-command-registry'
import { KeyboardShortcutsProvider } from '../../../keyboard-shortcuts/renderer/keyboard-shortcut-provider'
import { openFilesLocation } from '../files-open-location'
import { resetFilesStore, useFilesStore } from '../files-store'
import {
  FILES_CLOSE_ACTIVE_TAB_COMMAND_ID,
  FILES_SAVE_ALL_COMMAND_ID,
  FilesTool
} from './files-tool'

const diffsEditorMock = vi.hoisted(() => ({
  saveCommand: undefined as undefined | (() => void),
  revealLineInCenter: vi.fn<(line: number) => void>(),
  setPosition: vi.fn<(position: { lineNumber: number; column: number }) => void>(),
  focus: vi.fn<() => void>(),
  saveViewState: vi.fn<() => unknown>(() => ({ cursorState: [] })),
  restoreViewState: vi.fn<(state: unknown) => void>()
}))

vi.mock('./files-diffs-editor', async () => {
  const React = await vi.importActual<typeof import('react')>('react')
  return {
    FilesDiffsEditor: React.forwardRef(
      (
        {
          value,
          onChange,
          onSave,
          onStateChange
        }: {
          value: string
          onChange: (value: string) => void
          onSave: () => void
          onStateChange: (state: unknown) => void
        },
        ref
      ) => {
        React.useImperativeHandle(ref, () => ({
          applyEdits: vi.fn(),
          blur: vi.fn(),
          canRedo: () => false,
          canUndo: () => false,
          focus: ({ line, character }: { line: number; character?: number }) => {
            diffsEditorMock.revealLineInCenter(line)
            diffsEditorMock.setPosition({ lineNumber: line, column: character ?? 1 })
            diffsEditorMock.focus()
          },
          getState: () => {
            const state = diffsEditorMock.saveViewState()
            onStateChange(state)
            return state
          },
          redo: vi.fn(),
          undo: vi.fn()
        }))
        diffsEditorMock.saveCommand = onSave
        return (
          <textarea
            aria-label="Source editor"
            value={value}
            onChange={(event) => onChange(event.currentTarget.value)}
          />
        )
      }
    )
  }
})

vi.mock('@renderer/appearance-provider', () => ({
  useAppearance: () => ({
    themePreference: 'system',
    resolvedTheme: 'light',
    updateAppearanceSettings: vi.fn()
  })
}))

vi.mock('@renderer/components/rich-markdown-editor', () => ({
  RichMarkdownEditor: ({
    markdown,
    onChange
  }: {
    markdown: string
    onChange: (value: string) => void
  }) => (
    <textarea
      aria-label="Rich Markdown editor"
      value={markdown}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  )
}))

function requestContextKey(
  request: Parameters<typeof window.spacezero.files.listDirectory>[0]
): string {
  if (request.context.kind === 'project-home') return `project:${request.context.projectId}`
  return request.context.kind === 'project-session'
    ? request.context.sessionId
    : request.context.contextKey
}

describe('Files Tool App Commands', () => {
  beforeEach(() => {
    resetFilesStore()
    diffsEditorMock.saveCommand = undefined
  })

  it('keeps one stable Save All command ID while rebinding the handler to the active Files context across remounts', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'notes.txt', relativePath: 'notes.txt', kind: 'file' as const }
    ])
    window.spacezero.files.openDocument = vi.fn(async ({ context }) => {
      const contextKey = requestContextKey({ context, relativePath: '' })
      return {
        name: 'notes.txt',
        relativePath: 'notes.txt',
        contentKind: 'text' as const,
        size: 5,
        modifiedAt: new Date(0).toISOString(),
        revision: `${contextKey}-revision`,
        content: `${contextKey} saved`,
        hasBom: false,
        lineEnding: 'lf' as const
      }
    })
    window.spacezero.files.saveDocument = vi.fn(async ({ context, relativePath, content }) => {
      const contextKey = requestContextKey({ context, relativePath })
      return {
        status: 'saved' as const,
        document: {
          name: relativePath,
          relativePath,
          contentKind: 'text' as const,
          size: content.length,
          modifiedAt: new Date(1).toISOString(),
          revision: `${contextKey}-saved-revision`,
          content,
          hasBom: false,
          lineEnding: 'lf' as const
        }
      }
    })

    const registry = new AppCommandRegistry()
    const view = render(
      <AppCommandProvider registry={registry}>
        <KeyboardShortcutsProvider>
          <FilesTool sessionId="session-one" />
        </KeyboardShortcutsProvider>
      </AppCommandProvider>
    )

    await waitFor(() =>
      expect(registry.list().map((command) => command.id)).toEqual([
        FILES_SAVE_ALL_COMMAND_ID,
        FILES_CLOSE_ACTIVE_TAB_COMMAND_ID
      ])
    )
    await act(async () => {
      await openFilesLocation({
        contextKey: 'session-one',
        ipcContext: { kind: 'project-session', sessionId: 'session-one' },
        relativePath: 'notes.txt',
        intent: 'preview'
      })
    })
    fireEvent.change(await screen.findByLabelText('Source editor'), {
      target: { value: 'session one draft' }
    })

    view.rerender(
      <AppCommandProvider registry={registry}>
        <KeyboardShortcutsProvider>
          <FilesTool sessionId="session-two" />
        </KeyboardShortcutsProvider>
      </AppCommandProvider>
    )

    await waitFor(() =>
      expect(registry.list().map((command) => command.id)).toEqual([
        FILES_SAVE_ALL_COMMAND_ID,
        FILES_CLOSE_ACTIVE_TAB_COMMAND_ID
      ])
    )
    await act(async () => {
      await openFilesLocation({
        contextKey: 'session-two',
        ipcContext: { kind: 'project-session', sessionId: 'session-two' },
        relativePath: 'notes.txt',
        intent: 'preview'
      })
    })
    fireEvent.change(await screen.findByLabelText('Source editor'), {
      target: { value: 'session two draft' }
    })

    await act(async () => {
      await registry.invoke(FILES_SAVE_ALL_COMMAND_ID, { spacezero: window.spacezero })
    })

    await waitFor(() => expect(window.spacezero.files.saveDocument).toHaveBeenCalledTimes(1))
    expect(window.spacezero.files.saveDocument).toHaveBeenLastCalledWith({
      context: { kind: 'project-session', sessionId: 'session-two' },
      relativePath: 'notes.txt',
      content: 'session two draft',
      expectedRevision: 'session-two-revision'
    })

    view.rerender(
      <AppCommandProvider registry={registry}>
        <KeyboardShortcutsProvider>
          <FilesTool sessionId="session-one" />
        </KeyboardShortcutsProvider>
      </AppCommandProvider>
    )

    await waitFor(() =>
      expect(registry.list().map((command) => command.id)).toEqual([
        FILES_SAVE_ALL_COMMAND_ID,
        FILES_CLOSE_ACTIVE_TAB_COMMAND_ID
      ])
    )
    expect(await screen.findByDisplayValue('session one draft')).toBeInTheDocument()

    await act(async () => {
      await registry.invoke(FILES_SAVE_ALL_COMMAND_ID, { spacezero: window.spacezero })
    })

    await waitFor(() => expect(window.spacezero.files.saveDocument).toHaveBeenCalledTimes(2))
    expect(window.spacezero.files.saveDocument).toHaveBeenLastCalledWith({
      context: { kind: 'project-session', sessionId: 'session-one' },
      relativePath: 'notes.txt',
      content: 'session one draft',
      expectedRevision: 'session-one-revision'
    })
    const sessionTwoTab = useFilesStore.getState().contexts['session-two']?.tabs[0]
    expect(sessionTwoTab?.status).toBe('ready')
    if (sessionTwoTab?.status !== 'ready') throw new Error('expected session two tab to be ready')
    expect(sessionTwoTab.dirty).toBe(false)
  })

  it('closes the active clean Files tab with the focus-scoped mod+w command', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'notes.txt', relativePath: 'notes.txt', kind: 'file' as const }
    ])
    window.spacezero.files.openDocument = vi.fn(async () => ({
      name: 'notes.txt',
      relativePath: 'notes.txt',
      contentKind: 'text' as const,
      size: 5,
      modifiedAt: new Date(0).toISOString(),
      revision: 'revision',
      content: 'saved',
      hasBom: false,
      lineEnding: 'lf' as const
    }))

    const registry = new AppCommandRegistry()
    render(
      <AppCommandProvider registry={registry}>
        <KeyboardShortcutsProvider>
          <FilesTool sessionId="session-close" />
        </KeyboardShortcutsProvider>
      </AppCommandProvider>
    )

    await act(async () => {
      await openFilesLocation({
        contextKey: 'session-close',
        ipcContext: { kind: 'project-session', sessionId: 'session-close' },
        relativePath: 'notes.txt',
        intent: 'permanent'
      })
    })
    const editor = await screen.findByLabelText('Source editor')
    editor.focus()
    fireEvent.keyDown(window, { key: 'w', ctrlKey: true })

    await waitFor(() =>
      expect(useFilesStore.getState().contexts['session-close']?.tabs).toEqual([])
    )
    expect(screen.queryByLabelText('Source editor')).toBeNull()
    expect(registry.list().map((command) => command.id)).toContain(
      FILES_CLOSE_ACTIVE_TAB_COMMAND_ID
    )
  })
})
