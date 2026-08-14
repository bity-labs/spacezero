import type { ReactNode } from 'react'
import { act, fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppCommandProvider } from '../../../app-commands/renderer/app-command-context'
import { KeyboardShortcutsProvider } from '../../../keyboard-shortcuts/renderer/keyboard-shortcut-provider'
import {
  createProjectSessionSidePaneConfiguration,
  useRegisterTerminalSidePaneCommands
} from '../../../side-pane/renderer/side-pane-configurations'
import { TerminalTool } from './terminal-tool'
import type { TerminalEvent } from '../../shared'

let xterm: FakeXTerm
let terminalEventListener: ((event: TerminalEvent) => void) | null = null
const fit = vi.fn()
const proposeDimensions = vi.fn(() => ({ cols: 96, rows: 28 }))

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(function Terminal() {
    xterm = new FakeXTerm()
    return xterm
  })
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(function FitAddon() {
    return { fit, proposeDimensions }
  })
}))

const context = { kind: 'project-session' as const, sessionId: 'session-1' }
const sidePaneConfiguration = createProjectSessionSidePaneConfiguration({
  id: 'session-1',
  projectId: 'project-1'
})

function TerminalCommandRegistration(): null {
  useRegisterTerminalSidePaneCommands(sidePaneConfiguration)
  return null
}

function render(ui: ReactNode): ReturnType<typeof rtlRender> {
  return rtlRender(
    <AppCommandProvider>
      <TerminalCommandRegistration />
      <KeyboardShortcutsProvider>{ui}</KeyboardShortcutsProvider>
    </AppCommandProvider>
  )
}

describe('Terminal Side Pane presentation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    terminalEventListener = null
    window.spacezero.terminal.create = vi.fn(async () => ({
      status: 'running' as const,
      terminalId: 'unexpected-created-terminal'
    }))
    window.spacezero.terminal.subscribe = vi.fn(async () => ({
      terminalId: 'pty-a',
      events: [],
      oldestSequence: 1,
      nextSequence: 1
    }))
    window.spacezero.terminal.unsubscribe = vi.fn(async () => undefined)
    window.spacezero.terminal.writeInput = vi.fn(async () => undefined)
    window.spacezero.terminal.resize = vi.fn(async () => undefined)
    window.spacezero.terminal.close = vi.fn(async () => ({ tabs: [], activeTerminalId: null }))
    window.spacezero.terminal.onEvent = vi.fn((listener) => {
      terminalEventListener = listener
      return () => undefined
    })
  })

  it('renders exactly one referenced PTY with no nested tabs and fits only that visible terminal', async () => {
    render(<TerminalTool contextKey="session:session-1" context={context} terminalId="pty-a" />)

    await waitFor(() => expect(window.spacezero.terminal.subscribe).toHaveBeenCalled())

    expect(window.spacezero.terminal.create).not.toHaveBeenCalled()
    expect(screen.queryByRole('tablist', { name: 'Terminal tabs' })).not.toBeInTheDocument()
    expect(window.spacezero.terminal.subscribe).toHaveBeenCalledWith({
      terminalId: 'pty-a',
      context,
      afterSequence: 0
    })
    act(() =>
      terminalEventListener?.({
        type: 'output',
        terminalId: 'pty-a',
        sequence: 1,
        data: 'ready\r\n'
      })
    )
    expect(xterm.write).toHaveBeenCalledWith('ready\r\n')
    await waitFor(() =>
      expect(window.spacezero.terminal.resize).toHaveBeenCalledWith({
        terminalId: 'pty-a',
        context,
        cols: 96,
        rows: 28
      })
    )
    await waitFor(() => expect(xterm.onData).toHaveBeenCalled())
    expect(xterm.focus).toHaveBeenCalled()
    act(() => xterm.emitData('pnpm test\r'))
    expect(window.spacezero.terminal.writeInput).toHaveBeenCalledWith({
      terminalId: 'pty-a',
      context,
      data: 'pnpm test\r'
    })

    act(() =>
      terminalEventListener?.({
        type: 'output',
        terminalId: 'another-pty',
        sequence: 2,
        data: 'hidden output'
      })
    )
    expect(xterm.write).not.toHaveBeenCalledWith('hidden output')
  })

  it('switches the visible presentation without creating or stopping either main-owned PTY', async () => {
    window.spacezero.terminal.subscribe = vi.fn(async ({ terminalId }) => ({
      terminalId,
      events: [],
      oldestSequence: 1,
      nextSequence: 1
    }))
    const mounted = render(
      <TerminalTool contextKey="session:session-1" context={context} terminalId="pty-a" />
    )
    await waitFor(() =>
      expect(window.spacezero.terminal.subscribe).toHaveBeenCalledWith({
        terminalId: 'pty-a',
        context,
        afterSequence: 0
      })
    )

    mounted.rerender(
      <AppCommandProvider>
        <TerminalCommandRegistration />
        <KeyboardShortcutsProvider>
          <TerminalTool contextKey="session:session-1" context={context} terminalId="pty-b" />
        </KeyboardShortcutsProvider>
      </AppCommandProvider>
    )

    await waitFor(() =>
      expect(window.spacezero.terminal.unsubscribe).toHaveBeenCalledWith({
        terminalId: 'pty-a',
        context
      })
    )
    await waitFor(() =>
      expect(window.spacezero.terminal.subscribe).toHaveBeenCalledWith({
        terminalId: 'pty-b',
        context,
        afterSequence: 0
      })
    )
    expect(window.spacezero.terminal.create).not.toHaveBeenCalled()
    expect(window.spacezero.terminal.close).not.toHaveBeenCalled()
  })

  it('routes the focused new-terminal shortcut through peer Side Pane tab creation', async () => {
    const create = vi.fn(async () => ({
      status: 'running' as const,
      terminalId: 'pty-b',
      tabs: [
        { terminalId: 'pty-a', restorationId: 'saved-a', title: 'api' },
        { terminalId: 'pty-b', restorationId: 'saved-b', title: 'web' }
      ],
      activeTerminalId: 'pty-b'
    }))
    window.spacezero.terminal.create = create
    render(<TerminalTool contextKey="session:session-1" context={context} terminalId="pty-a" />)
    await waitFor(() => expect(xterm.keyHandler).not.toBeNull())
    fireEvent.focus(screen.getByRole('region', { name: 'Terminal' }))

    await act(async () => {
      xterm.emitKeyDown('t')
      await Promise.resolve()
    })

    await waitFor(() => expect(create).toHaveBeenCalledWith({ context, forceNew: true }))
  })

  it('opens complete HTTPS output through the Browser only on mod+click', async () => {
    const openBrowserPage = vi.fn(async () => undefined)
    render(
      <TerminalTool
        contextKey="session:session-1"
        context={context}
        terminalId="pty-a"
        browserHandoff={{ openBrowserPage }}
      />
    )
    await waitFor(() => expect(xterm.linkProvider).not.toBeNull())
    xterm.setLine('Open https://example.com/docs.')
    let links: Array<{ text: string; activate: (event: MouseEvent, text: string) => void }> = []
    xterm.linkProvider!.provideLinks(1, (provided) => {
      links = provided
    })

    links[0]!.activate(new MouseEvent('click'), links[0]!.text)
    expect(openBrowserPage).not.toHaveBeenCalled()

    await act(async () => {
      links[0]!.activate(new MouseEvent('click', { ctrlKey: true }), links[0]!.text)
      await Promise.resolve()
    })
    expect(openBrowserPage).toHaveBeenCalledWith('https://example.com/docs')
  })
})

class FakeXTerm {
  cols = 80
  line = ''
  linkProvider: {
    provideLinks: (
      line: number,
      callback: (
        links: Array<{ text: string; activate: (event: MouseEvent, text: string) => void }>
      ) => void
    ) => void
  } | null = null
  buffer = {
    active: {
      viewportY: 0,
      getLine: vi.fn((lineIndex: number) =>
        lineIndex === 0 && this.line ? new FakeBufferLine(this.line) : undefined
      )
    }
  }
  write = vi.fn((_data: string, callback?: () => void) => callback?.())
  focus = vi.fn()
  open = vi.fn()
  dispose = vi.fn()
  loadAddon = vi.fn()
  scrollToLine = vi.fn()
  keyHandler: ((event: KeyboardEvent) => boolean) | null = null
  attachCustomKeyEventHandler = vi.fn((handler: (event: KeyboardEvent) => boolean) => {
    this.keyHandler = handler
  })
  registerLinkProvider = vi.fn((provider: NonNullable<FakeXTerm['linkProvider']>) => {
    this.linkProvider = provider
    return { dispose: vi.fn() }
  })
  onDataListener: ((data: string) => void) | null = null
  onData = vi.fn((listener: (data: string) => void) => {
    this.onDataListener = listener
    return { dispose: vi.fn() }
  })

  emitData(data: string): void {
    this.onDataListener?.(data)
  }

  emitKeyDown(key: string): void {
    this.keyHandler?.(new KeyboardEvent('keydown', { key, ctrlKey: true }))
  }

  setLine(line: string): void {
    this.line = line
    this.cols = line.length
  }
}

class FakeBufferLine {
  isWrapped = false

  constructor(private readonly text: string) {}

  get length(): number {
    return this.text.length
  }

  getCell(index: number): { getChars: () => string; getWidth: () => number } | undefined {
    const character = this.text[index]
    return character === undefined ? undefined : { getChars: () => character, getWidth: () => 1 }
  }
}
