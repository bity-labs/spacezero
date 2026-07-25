import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TerminalTool } from './terminal-tool'
import type { TerminalEvent, TerminalSubscribeResult } from '../../shared'

let lastTerminal: FakeXTerm | null = null
let allTerminals: FakeXTerm[] = []
let terminalEventListener: ((event: TerminalEvent) => void) | null = null
let deferWriteCallbacks = false
let pendingWriteCallbacks: Array<() => void> = []

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(function Terminal() {
    lastTerminal = new FakeXTerm()
    allTerminals.push(lastTerminal)
    return lastTerminal
  })
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(function FitAddon() {
    return {
      fit: vi.fn(),
      proposeDimensions: vi.fn(() => ({ cols: 100, rows: 30 }))
    }
  })
}))

const context = { kind: 'project-session' as const, sessionId: 'session-1' }
const terminalApiDefaults = {
  listTabs: vi.fn(async () => ({ tabs: [], activeTerminalId: null })),
  selectTab: vi.fn(async ({ terminalId }: { terminalId: string }) => ({
    tabs: [{ terminalId, title: 'Shell' }],
    activeTerminalId: terminalId
  })),
  reorderTabs: vi.fn(async () => ({ tabs: [], activeTerminalId: null }))
}

describe('TerminalTool', () => {
  beforeEach(() => {
    lastTerminal = null
    allTerminals = []
    terminalEventListener = null
    deferWriteCallbacks = false
    pendingWriteCallbacks = []
  })

  it('lazily creates and subscribes to one Project Session terminal, replays output, and forwards keyboard input unchanged', async () => {
    const create = vi.fn(async () => ({ status: 'running' as const, terminalId: 'terminal-1' }))
    const subscribe = vi.fn(async () => ({
      terminalId: 'terminal-1',
      events: [
        { type: 'output' as const, terminalId: 'terminal-1', sequence: 1, data: 'hello\r\n' }
      ],
      oldestSequence: 1,
      nextSequence: 2
    }))
    const writeInput = vi.fn(async () => undefined)
    const resize = vi.fn(async () => undefined)
    const unsubscribe = vi.fn(async () => undefined)
    window.spacezero.terminal = {
      ...terminalApiDefaults,
      create,
      subscribe,
      unsubscribe,
      writeInput,
      resize,
      close: vi.fn(async () => undefined),
      onEvent: vi.fn((listener) => {
        terminalEventListener = listener
        return () => undefined
      })
    }

    render(<TerminalTool context={context} />)

    await waitFor(() => expect(screen.getByRole('region', { name: 'Terminal' })).toBeVisible())
    await waitFor(() => expect(subscribe).toHaveBeenCalled())
    expect(create).toHaveBeenCalledWith({
      context,
      cols: undefined,
      rows: undefined,
      forceNew: false
    })
    expect(lastTerminal?.write).toHaveBeenCalledWith('hello\r\n', expect.any(Function))
    expect(resize).toHaveBeenCalledWith({
      terminalId: 'terminal-1',
      context,
      cols: 100,
      rows: 30
    })

    act(() => lastTerminal?.emitData('npm test\r'))
    expect(writeInput).toHaveBeenCalledWith({
      terminalId: 'terminal-1',
      context,
      data: 'npm test\r'
    })

    act(() =>
      terminalEventListener?.({
        type: 'output',
        terminalId: 'terminal-1',
        sequence: 2,
        data: 'done\r\n'
      })
    )
    expect(lastTerminal?.write).toHaveBeenCalledWith('done\r\n')
  })

  it('exposes HTTP and HTTPS output as Terminal Links that activate only on mod+click and hand off to the contextual Browser', async () => {
    const createTab = vi.fn(async () => ({
      contextKey: 'session:session-1',
      activeTabId: 'browser-tab-1',
      tabs: []
    }))
    const openBrowserTool = vi.fn()
    window.spacezero.browser.createTab = createTab
    window.spacezero.browser.openUrlInDefaultBrowser = vi.fn(async () => undefined)
    window.spacezero.terminal = {
      ...terminalApiDefaults,
      create: vi.fn(async () => ({ status: 'running' as const, terminalId: 'terminal-1' })),
      subscribe: vi.fn(async () => ({
        terminalId: 'terminal-1',
        events: [],
        oldestSequence: 1,
        nextSequence: 1
      })),
      unsubscribe: vi.fn(async () => undefined),
      writeInput: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      onEvent: vi.fn(() => () => undefined)
    }

    render(
      <TerminalTool
        context={context}
        browserHandoff={{
          contextKey: 'session:session-1',
          context: { kind: 'project-session', projectId: 'project-1', sessionId: 'session-1' },
          openBrowserTool
        }}
      />
    )

    await waitFor(() => expect(lastTerminal?.linkProviders).toHaveLength(1))
    lastTerminal!.setLines(['server: http://localhost:5173/ and https://example.com/docs.'])
    let links: Array<{ text: string; activate: (event: MouseEvent, text: string) => void }> = []
    lastTerminal!.linkProviders[0]!.provideLinks(1, (provided) => {
      links = provided
    })

    expect(links.map((link) => link.text)).toEqual([
      'http://localhost:5173/',
      'https://example.com/docs'
    ])
    expect(links[0]).toMatchObject({
      range: { start: { x: 9, y: 1 }, end: { x: 30, y: 1 } }
    })
    await act(async () => {
      links[0]!.activate(new MouseEvent('click'), links[0]!.text)
      await Promise.resolve()
    })
    expect(createTab).not.toHaveBeenCalled()

    await act(async () => {
      links[0]!.activate(new MouseEvent('click', { metaKey: true }), links[0]!.text)
      await Promise.resolve()
    })

    expect(createTab).toHaveBeenCalledWith({
      contextKey: 'session:session-1',
      context: { kind: 'project-session', projectId: 'project-1', sessionId: 'session-1' },
      input: 'http://localhost:5173/'
    })
    expect(openBrowserTool).toHaveBeenCalledTimes(1)
    expect(window.spacezero.terminal.writeInput).not.toHaveBeenCalled()
  })

  it('builds Terminal Links from complete wrapped logical lines with cell-aware ranges', async () => {
    const createTab = vi.fn(async () => ({
      contextKey: 'session:session-1',
      activeTabId: 'browser-tab-1',
      tabs: []
    }))
    window.spacezero.browser.createTab = createTab
    window.spacezero.browser.openUrlInDefaultBrowser = vi.fn(async () => undefined)
    window.spacezero.terminal = {
      ...terminalApiDefaults,
      create: vi.fn(async () => ({ status: 'running' as const, terminalId: 'terminal-1' })),
      subscribe: vi.fn(async () => ({
        terminalId: 'terminal-1',
        events: [],
        oldestSequence: 1,
        nextSequence: 1
      })),
      unsubscribe: vi.fn(async () => undefined),
      writeInput: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      onEvent: vi.fn(() => () => undefined)
    }

    render(
      <TerminalTool
        context={context}
        browserHandoff={{
          contextKey: 'session:session-1',
          context: { kind: 'project-session', projectId: 'project-1', sessionId: 'session-1' },
          openBrowserTool: vi.fn()
        }}
      />
    )

    await waitFor(() => expect(lastTerminal?.linkProviders).toHaveLength(1))
    lastTerminal!.cols = 13
    lastTerminal!.setLines([
      { text: '界 http://exa', isWrapped: false },
      { text: 'mple.test/ok', isWrapped: true }
    ])

    let firstRowLinks: Array<{
      text: string
      range: { start: { x: number; y: number }; end: { x: number; y: number } }
    }> = []
    lastTerminal!.linkProviders[0]!.provideLinks(1, (provided) => {
      firstRowLinks = provided
    })
    let wrappedRowLinks: Array<{
      text: string
      range: { start: { x: number; y: number }; end: { x: number; y: number } }
    }> = []
    lastTerminal!.linkProviders[0]!.provideLinks(2, (provided) => {
      wrappedRowLinks = provided
    })

    expect(firstRowLinks).toHaveLength(1)
    expect(firstRowLinks[0]).toMatchObject({
      text: 'http://example.test/ok',
      range: { start: { x: 4, y: 1 }, end: { x: 12, y: 2 } }
    })
    expect(wrappedRowLinks).toMatchObject([
      {
        text: 'http://example.test/ok',
        range: { start: { x: 4, y: 1 }, end: { x: 12, y: 2 } }
      }
    ])
  })

  it('offers explicit Copy URL and Open in default browser choices when Browser handoff is unavailable', async () => {
    window.spacezero.terminal = {
      ...terminalApiDefaults,
      create: vi.fn(async () => ({ status: 'running' as const, terminalId: 'terminal-1' })),
      subscribe: vi.fn(async () => ({
        terminalId: 'terminal-1',
        events: [],
        oldestSequence: 1,
        nextSequence: 1
      })),
      unsubscribe: vi.fn(async () => undefined),
      writeInput: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      onEvent: vi.fn(() => () => undefined)
    }
    window.spacezero.browser.openUrlInDefaultBrowser = vi.fn(async () => undefined)

    render(<TerminalTool context={context} />)
    await waitFor(() => expect(lastTerminal?.linkProviders).toHaveLength(1))
    lastTerminal!.setLines(['Open https://example.com/fallback'])
    let links: Array<{ text: string; activate: (event: MouseEvent, text: string) => void }> = []
    lastTerminal!.linkProviders[0]!.provideLinks(1, (provided) => {
      links = provided
    })

    await act(async () => {
      links[0]!.activate(new MouseEvent('click', { ctrlKey: true }), links[0]!.text)
      await Promise.resolve()
    })

    expect(screen.getByRole('dialog', { name: 'Terminal Link choices' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Open in default browser' }))
    expect(window.spacezero.browser.openUrlInDefaultBrowser).toHaveBeenCalledWith({
      url: 'https://example.com/fallback'
    })
  })

  it('uses the owning workspace-session or knowledge-base context without rewriting it to a project session', async () => {
    const create = vi.fn(async () => ({ status: 'running' as const, terminalId: 'terminal-1' }))
    window.spacezero.terminal = {
      ...terminalApiDefaults,
      create,
      subscribe: vi.fn(async () => ({
        terminalId: 'terminal-1',
        events: [],
        oldestSequence: 1,
        nextSequence: 1
      })),
      unsubscribe: vi.fn(async () => undefined),
      writeInput: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      onEvent: vi.fn(() => () => undefined)
    }

    const workspaceContext = { kind: 'workspace-session' as const, sessionId: 'workspace-1' }
    const mounted = render(<TerminalTool context={workspaceContext} />)
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ context: workspaceContext }))
    )

    mounted.unmount()
    const knowledgeBaseContext = { kind: 'knowledge-base' as const }
    render(<TerminalTool context={knowledgeBaseContext} />)
    await waitFor(() =>
      expect(create).toHaveBeenLastCalledWith(
        expect.objectContaining({ context: knowledgeBaseContext })
      )
    )
  })

  it('does not recreate or resubscribe when rerendered with an equivalent terminal context', async () => {
    const removeEventListener = vi.fn()
    const unsubscribe = vi.fn(async () => undefined)
    window.spacezero.terminal = {
      ...terminalApiDefaults,
      create: vi.fn(async () => ({ status: 'running' as const, terminalId: 'terminal-1' })),
      subscribe: vi.fn(async () => ({
        terminalId: 'terminal-1',
        events: [],
        oldestSequence: 1,
        nextSequence: 1
      })),
      unsubscribe,
      writeInput: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      onEvent: vi.fn(() => removeEventListener)
    }

    const mounted = render(
      <TerminalTool context={{ kind: 'project-session', sessionId: 'same' }} />
    )
    await waitFor(() => expect(window.spacezero.terminal.subscribe).toHaveBeenCalledTimes(1))
    const firstPresentation = lastTerminal

    mounted.rerender(<TerminalTool context={{ kind: 'project-session', sessionId: 'same' }} />)
    await Promise.resolve()

    expect(window.spacezero.terminal.create).toHaveBeenCalledTimes(1)
    expect(window.spacezero.terminal.subscribe).toHaveBeenCalledTimes(1)
    expect(window.spacezero.terminal.onEvent).toHaveBeenCalledTimes(1)
    expect(unsubscribe).not.toHaveBeenCalled()
    expect(removeEventListener).not.toHaveBeenCalled()
    expect(firstPresentation?.dispose).not.toHaveBeenCalled()
    expect(allTerminals).toHaveLength(1)
  })

  it('recreates presentation and subscription only when the semantic terminal context changes', async () => {
    window.spacezero.terminal = {
      ...terminalApiDefaults,
      create: vi.fn(async ({ context: requestedContext }) => ({
        status: 'running' as const,
        terminalId:
          requestedContext.kind === 'knowledge-base'
            ? 'terminal-knowledge-base'
            : `terminal-${requestedContext.kind}-${requestedContext.sessionId}`
      })),
      subscribe: vi.fn(async ({ terminalId }) => ({
        terminalId,
        events: [],
        oldestSequence: 1,
        nextSequence: 1
      })),
      unsubscribe: vi.fn(async () => undefined),
      writeInput: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      onEvent: vi.fn(() => () => undefined)
    }

    const mounted = render(
      <TerminalTool context={{ kind: 'workspace-session', sessionId: 'one' }} />
    )
    await waitFor(() => expect(window.spacezero.terminal.subscribe).toHaveBeenCalledTimes(1))
    const firstPresentation = lastTerminal

    mounted.rerender(<TerminalTool context={{ kind: 'workspace-session', sessionId: 'two' }} />)
    await waitFor(() => expect(window.spacezero.terminal.subscribe).toHaveBeenCalledTimes(2))

    expect(window.spacezero.terminal.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ context: { kind: 'workspace-session', sessionId: 'one' } })
    )
    expect(window.spacezero.terminal.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ context: { kind: 'workspace-session', sessionId: 'two' } })
    )
    expect(window.spacezero.terminal.unsubscribe).toHaveBeenCalledWith({
      terminalId: 'terminal-workspace-session-one',
      context: { kind: 'workspace-session', sessionId: 'one' }
    })
    expect(firstPresentation?.dispose).toHaveBeenCalled()
    expect(allTerminals).toHaveLength(2)
  })

  it('never builds a presentation for a terminal outside the current context while switching', async () => {
    let resolveSecondCreate!: (result: { status: 'running'; terminalId: string }) => void
    let createCalls = 0
    window.spacezero.terminal = {
      ...terminalApiDefaults,
      create: vi.fn(async ({ context: requestedContext }) => {
        createCalls += 1
        if (createCalls === 2) {
          return new Promise<{ status: 'running'; terminalId: string }>((resolve) => {
            resolveSecondCreate = resolve
          })
        }
        return {
          status: 'running' as const,
          terminalId: `terminal-${requestedContext.kind}-${requestedContext.sessionId}`
        }
      }),
      subscribe: vi.fn(async ({ terminalId }) => ({
        terminalId,
        events: [],
        oldestSequence: 1,
        nextSequence: 1
      })),
      unsubscribe: vi.fn(async () => undefined),
      writeInput: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      onEvent: vi.fn(() => () => undefined)
    }

    const firstContext = { kind: 'workspace-session' as const, sessionId: 'one' }
    const secondContext = { kind: 'workspace-session' as const, sessionId: 'two' }
    const mounted = render(<TerminalTool context={firstContext} />)
    await waitFor(() => expect(window.spacezero.terminal.subscribe).toHaveBeenCalledTimes(1))
    const firstPresentation = lastTerminal

    mounted.rerender(<TerminalTool context={secondContext} />)
    await act(async () => {
      await Promise.resolve()
    })

    expect(allTerminals).toHaveLength(1)
    expect(firstPresentation?.dispose).toHaveBeenCalled()
    expect(window.spacezero.terminal.subscribe).not.toHaveBeenCalledWith(
      expect.objectContaining({
        terminalId: 'terminal-workspace-session-one',
        context: secondContext
      })
    )

    await act(async () => {
      resolveSecondCreate({ status: 'running', terminalId: 'terminal-workspace-session-two' })
    })
    await waitFor(() =>
      expect(window.spacezero.terminal.subscribe).toHaveBeenCalledWith(
        expect.objectContaining({
          terminalId: 'terminal-workspace-session-two',
          context: secondContext
        })
      )
    )
    expect(allTerminals).toHaveLength(2)
  })

  it('switches among two Project Sessions, two Workspace Sessions, and Knowledge Base without mixing presentations', async () => {
    const contexts = [
      { kind: 'project-session' as const, sessionId: 'project-1' },
      { kind: 'project-session' as const, sessionId: 'project-2' },
      { kind: 'workspace-session' as const, sessionId: 'workspace-1' },
      { kind: 'workspace-session' as const, sessionId: 'workspace-2' },
      { kind: 'knowledge-base' as const }
    ]
    window.spacezero.terminal = {
      ...terminalApiDefaults,
      create: vi.fn(async ({ context: requestedContext }) => ({
        status: 'running' as const,
        terminalId:
          requestedContext.kind === 'knowledge-base'
            ? 'terminal-knowledge-base'
            : `terminal-${requestedContext.kind}-${requestedContext.sessionId}`
      })),
      subscribe: vi.fn(async ({ terminalId }) => ({
        terminalId,
        events: [
          {
            type: 'output' as const,
            terminalId,
            sequence: 1,
            data: `${terminalId} output\r\n`
          }
        ],
        oldestSequence: 1,
        nextSequence: 2
      })),
      unsubscribe: vi.fn(async () => undefined),
      writeInput: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      onEvent: vi.fn(() => () => undefined)
    }

    const mounted = render(<TerminalTool context={contexts[0]} />)
    for (let index = 0; index < contexts.length; index += 1) {
      if (index > 0) mounted.rerender(<TerminalTool context={contexts[index]!} />)
      const expectedTerminalId =
        contexts[index]!.kind === 'knowledge-base'
          ? 'terminal-knowledge-base'
          : `terminal-${contexts[index]!.kind}-${contexts[index]!.sessionId}`
      await waitFor(() =>
        expect(lastTerminal?.write).toHaveBeenCalledWith(
          `${expectedTerminalId} output\r\n`,
          expect.any(Function)
        )
      )
    }

    expect(window.spacezero.terminal.create).toHaveBeenCalledTimes(5)
    for (const terminalContext of contexts) {
      const expectedTerminalId =
        terminalContext.kind === 'knowledge-base'
          ? 'terminal-knowledge-base'
          : `terminal-${terminalContext.kind}-${terminalContext.sessionId}`
      expect(
        allTerminals.some((terminal) =>
          terminal.write.mock.calls.flat().includes(`${expectedTerminalId} output\r\n`)
        )
      ).toBe(true)
    }
  })

  it('merges subscribe replay and live output in sequence order without gaps or duplicates', async () => {
    let resolveSubscribe:
      | ((value: {
          terminalId: string
          events: TerminalEvent[]
          oldestSequence: number
          nextSequence: number
        }) => void)
      | null = null
    window.spacezero.terminal = {
      ...terminalApiDefaults,
      create: vi.fn(async () => ({ status: 'running' as const, terminalId: 'terminal-1' })),
      subscribe: vi.fn(
        () =>
          new Promise<TerminalSubscribeResult>((resolve) => {
            resolveSubscribe = resolve
          })
      ),
      unsubscribe: vi.fn(async () => undefined),
      writeInput: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      onEvent: vi.fn((listener) => {
        terminalEventListener = listener
        return () => undefined
      })
    }

    render(<TerminalTool context={context} />)

    await waitFor(() => expect(window.spacezero.terminal.subscribe).toHaveBeenCalled())
    act(() =>
      terminalEventListener?.({
        type: 'output',
        terminalId: 'terminal-1',
        sequence: 2,
        data: 'second\r\n'
      })
    )
    await act(async () => {
      resolveSubscribe?.({
        terminalId: 'terminal-1',
        events: [
          { type: 'output', terminalId: 'terminal-1', sequence: 1, data: 'first\r\n' },
          { type: 'output', terminalId: 'terminal-1', sequence: 2, data: 'second\r\n' }
        ],
        oldestSequence: 1,
        nextSequence: 3
      })
    })

    expect(lastTerminal?.write).toHaveBeenNthCalledWith(1, 'first\r\n', expect.any(Function))
    expect(lastTerminal?.write).toHaveBeenNthCalledWith(2, 'second\r\n', expect.any(Function))
    expect(lastTerminal?.write).toHaveBeenCalledTimes(2)
  })

  it('buffers live output until deferred replay writes finish', async () => {
    deferWriteCallbacks = true
    window.spacezero.terminal = {
      ...terminalApiDefaults,
      create: vi.fn(async () => ({ status: 'running' as const, terminalId: 'terminal-1' })),
      subscribe: vi.fn(async () => ({
        terminalId: 'terminal-1',
        events: [
          { type: 'output' as const, terminalId: 'terminal-1', sequence: 1, data: 'first\r\n' },
          { type: 'output' as const, terminalId: 'terminal-1', sequence: 2, data: 'second\r\n' }
        ],
        oldestSequence: 1,
        nextSequence: 3
      })),
      unsubscribe: vi.fn(async () => undefined),
      writeInput: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      onEvent: vi.fn((listener) => {
        terminalEventListener = listener
        return () => undefined
      })
    }

    render(<TerminalTool context={context} />)

    await waitFor(() =>
      expect(lastTerminal?.write).toHaveBeenCalledWith('first\r\n', expect.any(Function))
    )
    await waitFor(() => expect(window.spacezero.terminal.onEvent).toHaveBeenCalled())
    act(() =>
      terminalEventListener?.({
        type: 'output',
        terminalId: 'terminal-1',
        sequence: 3,
        data: 'third\r\n'
      })
    )
    expect(lastTerminal?.write).not.toHaveBeenCalledWith('third\r\n')

    act(() => pendingWriteCallbacks.shift()?.())
    await waitFor(() =>
      expect(lastTerminal?.write).toHaveBeenCalledWith('second\r\n', expect.any(Function))
    )
    expect(lastTerminal?.write).not.toHaveBeenCalledWith('third\r\n')

    act(() => pendingWriteCallbacks.shift()?.())
    await waitFor(() =>
      expect(lastTerminal?.write).toHaveBeenCalledWith('third\r\n', expect.any(Function))
    )
  })

  it('does not mark an exited terminal running after deferred replay writes finish', async () => {
    deferWriteCallbacks = true
    window.spacezero.terminal = {
      ...terminalApiDefaults,
      create: vi.fn(async () => ({ status: 'running' as const, terminalId: 'terminal-1' })),
      subscribe: vi.fn(async () => ({
        terminalId: 'terminal-1',
        events: [
          { type: 'output' as const, terminalId: 'terminal-1', sequence: 1, data: 'first\r\n' }
        ],
        oldestSequence: 1,
        nextSequence: 2
      })),
      unsubscribe: vi.fn(async () => undefined),
      writeInput: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      onEvent: vi.fn((listener) => {
        terminalEventListener = listener
        return () => undefined
      })
    }

    render(<TerminalTool context={context} />)

    await waitFor(() =>
      expect(lastTerminal?.write).toHaveBeenCalledWith('first\r\n', expect.any(Function))
    )
    await waitFor(() => expect(window.spacezero.terminal.onEvent).toHaveBeenCalled())
    act(() =>
      terminalEventListener?.({ type: 'exit', terminalId: 'terminal-1', exitCode: 0, signal: null })
    )
    act(() => pendingWriteCallbacks.shift()?.())

    expect(await screen.findByRole('button', { name: 'New Terminal' })).toBeVisible()
    expect(screen.queryByText('Starting terminal…')).not.toBeInTheDocument()
  })

  it('resets replay sequencing when a replacement terminal starts at sequence one', async () => {
    const user = userEvent.setup()
    let createCount = 0
    window.confirm = vi.fn(() => true)
    window.spacezero.terminal = {
      ...terminalApiDefaults,
      create: vi.fn(async () => {
        createCount += 1
        return { status: 'running' as const, terminalId: `terminal-${createCount}` }
      }),
      subscribe: vi.fn(async ({ terminalId }) => ({
        terminalId,
        events: [
          {
            type: 'output' as const,
            terminalId,
            sequence: terminalId === 'terminal-1' ? 10 : 1,
            data: `${terminalId} output\r\n`
          }
        ],
        oldestSequence: 1,
        nextSequence: terminalId === 'terminal-1' ? 11 : 2
      })),
      unsubscribe: vi.fn(async () => undefined),
      writeInput: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      onEvent: vi.fn((listener) => {
        terminalEventListener = listener
        return () => undefined
      })
    }

    render(<TerminalTool context={context} />)

    await screen.findByRole('button', { name: 'Close Terminal' })
    await waitFor(() =>
      expect(lastTerminal?.write).toHaveBeenCalledWith(
        'terminal-1 output\r\n',
        expect.any(Function)
      )
    )
    await user.click(screen.getByRole('button', { name: 'Close Terminal' }))
    await user.click(await screen.findByRole('button', { name: 'New Terminal' }))
    await screen.findByRole('button', { name: 'Close Terminal' })

    await waitFor(() =>
      expect(lastTerminal?.write).toHaveBeenCalledWith(
        'terminal-2 output\r\n',
        expect.any(Function)
      )
    )
    expect(window.spacezero.terminal.create).toHaveBeenLastCalledWith({
      context,
      cols: undefined,
      rows: undefined,
      forceNew: true
    })
  })

  it('shows the durable empty state on remount without starting a replacement shell', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({ status: 'running' as const, terminalId: 'terminal-1' })
      .mockResolvedValueOnce({ status: 'empty' as const, terminalId: null })
    const close = vi.fn(async () => undefined)
    window.confirm = vi.fn(() => true)
    window.spacezero.terminal = {
      ...terminalApiDefaults,
      create,
      subscribe: vi.fn(async () => ({
        terminalId: 'terminal-1',
        events: [],
        oldestSequence: 1,
        nextSequence: 1
      })),
      unsubscribe: vi.fn(async () => undefined),
      writeInput: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close,
      onEvent: vi.fn((listener) => {
        terminalEventListener = listener
        return () => undefined
      })
    }

    const mounted = render(<TerminalTool context={context} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Close Terminal' }))
    expect(await screen.findByRole('button', { name: 'New Terminal' })).toBeVisible()
    mounted.unmount()
    render(<TerminalTool context={context} />)

    expect(await screen.findByRole('button', { name: 'New Terminal' })).toBeVisible()
    expect(create).toHaveBeenCalledTimes(2)
    expect(create).toHaveBeenLastCalledWith({
      context,
      cols: undefined,
      rows: undefined,
      forceNew: false
    })
  })

  it('asks before closing a live terminal and returns to the New Terminal state on close or exit', async () => {
    const user = userEvent.setup()
    const close = vi.fn(async () => undefined)
    window.confirm = vi.fn(() => true)
    window.spacezero.terminal = {
      ...terminalApiDefaults,
      create: vi.fn(async () => ({ status: 'running' as const, terminalId: 'terminal-1' })),
      subscribe: vi.fn(async () => ({
        terminalId: 'terminal-1',
        events: [],
        oldestSequence: 1,
        nextSequence: 1
      })),
      unsubscribe: vi.fn(async () => undefined),
      writeInput: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close,
      onEvent: vi.fn((listener) => {
        terminalEventListener = listener
        return () => undefined
      })
    }

    render(<TerminalTool context={context} />)

    await user.click(await screen.findByRole('button', { name: 'Close Terminal' }))
    expect(window.confirm).toHaveBeenCalledWith('Close this live terminal and terminate its shell?')
    expect(close).toHaveBeenCalledWith({ terminalId: 'terminal-1', context })
    expect(await screen.findByRole('button', { name: 'New Terminal' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'New Terminal' }))
    await screen.findByRole('button', { name: 'Close Terminal' })
    act(() =>
      terminalEventListener?.({ type: 'exit', terminalId: 'terminal-1', exitCode: 0, signal: null })
    )
    expect(await screen.findByRole('button', { name: 'New Terminal' })).toBeVisible()
  })

  it('ignores stale-terminal unsubscribe races after close and natural exit', async () => {
    const user = userEvent.setup()
    const unsubscribe = vi.fn(async () => {
      throw new Error('terminal.notFound')
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const create = vi
      .fn()
      .mockResolvedValueOnce({ status: 'running' as const, terminalId: 'terminal-1' })
      .mockResolvedValueOnce({ status: 'running' as const, terminalId: 'terminal-2' })
    window.confirm = vi.fn(() => true)
    window.spacezero.terminal = {
      ...terminalApiDefaults,
      create,
      subscribe: vi.fn(async ({ terminalId }) => ({
        terminalId,
        events: [],
        oldestSequence: 1,
        nextSequence: 1
      })),
      unsubscribe,
      writeInput: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      onEvent: vi.fn((listener) => {
        terminalEventListener = listener
        return () => undefined
      })
    }

    try {
      render(<TerminalTool context={context} />)

      await user.click(await screen.findByRole('button', { name: 'Close Terminal' }))
      await waitFor(() =>
        expect(unsubscribe).toHaveBeenCalledWith({ terminalId: 'terminal-1', context })
      )
      await user.click(await screen.findByRole('button', { name: 'New Terminal' }))
      await screen.findByRole('button', { name: 'Close Terminal' })
      await waitFor(() => expect(window.spacezero.terminal.onEvent).toHaveBeenCalledTimes(2))
      act(() =>
        terminalEventListener?.({
          type: 'exit',
          terminalId: 'terminal-2',
          exitCode: 0,
          signal: null
        })
      )

      await waitFor(() =>
        expect(unsubscribe).toHaveBeenCalledWith({ terminalId: 'terminal-2', context })
      )
      expect(consoleError).not.toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
    }
  })

  it('adds, selects, reorders, and closes accessible terminal tabs without stealing focus', async () => {
    const user = userEvent.setup()
    let activeTerminalId = 'terminal-1'
    const tabs = [
      { terminalId: 'terminal-1', title: 'zsh' },
      { terminalId: 'terminal-2', title: 'zsh' }
    ]
    window.confirm = vi.fn(() => true)
    window.spacezero.terminal = {
      ...terminalApiDefaults,
      create: vi.fn(async ({ forceNew }) => {
        if (forceNew) activeTerminalId = 'terminal-2'
        return {
          status: 'running' as const,
          terminalId: activeTerminalId,
          tabs,
          activeTerminalId
        }
      }),
      selectTab: vi.fn(async ({ terminalId }) => {
        activeTerminalId = terminalId
        return { tabs, activeTerminalId }
      }),
      reorderTabs: vi.fn(async ({ terminalIds }) => ({
        tabs: terminalIds.map((terminalId) => tabs.find((tab) => tab.terminalId === terminalId)!),
        activeTerminalId
      })),
      subscribe: vi.fn(async ({ terminalId }) => ({
        terminalId,
        events: [{ type: 'output' as const, terminalId, sequence: 1, data: `${terminalId}\r\n` }],
        oldestSequence: 1,
        nextSequence: 2
      })),
      unsubscribe: vi.fn(async () => undefined),
      writeInput: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      onEvent: vi.fn(() => () => undefined)
    }

    render(<TerminalTool context={context} />)

    await screen.findByRole('tab', { name: 'Select terminal tab zsh', selected: true })
    expect(document.activeElement).not.toBe(screen.getByLabelText('Terminal output'))
    await user.click(screen.getByRole('button', { name: 'Add terminal tab' }))
    await waitFor(() =>
      expect(window.spacezero.terminal.create).toHaveBeenLastCalledWith({
        context,
        cols: 100,
        rows: 30,
        forceNew: true
      })
    )
    expect(screen.getAllByRole('tab')).toHaveLength(2)

    await user.click(screen.getAllByRole('tab')[0]!)
    expect(window.spacezero.terminal.selectTab).toHaveBeenCalledWith({
      terminalId: 'terminal-1',
      context
    })

    const tabRows = screen.getAllByRole('tab').map((tab) => tab.parentElement!)
    act(() => {
      tabRows[1]?.dispatchEvent(new Event('dragstart', { bubbles: true }))
      tabRows[0]?.dispatchEvent(new Event('drop', { bubbles: true }))
    })
    await waitFor(() =>
      expect(window.spacezero.terminal.reorderTabs).toHaveBeenCalledWith({
        context,
        terminalIds: ['terminal-2', 'terminal-1']
      })
    )

    await user.click(screen.getByRole('button', { name: 'Close Terminal' }))
    expect(window.confirm).toHaveBeenCalledWith('Close this live terminal and terminate its shell?')
    expect(window.spacezero.terminal.close).toHaveBeenCalledWith({
      terminalId: activeTerminalId,
      context
    })
  })

  it('renders folder-based labels from main snapshots and updates them from validated cwd events without using shell titles', async () => {
    const tabs = [
      { terminalId: 'terminal-1', title: 'api' },
      { terminalId: 'terminal-2', title: 'api' }
    ]
    window.spacezero.terminal = {
      ...terminalApiDefaults,
      create: vi.fn(async () => ({
        status: 'running' as const,
        terminalId: 'terminal-1',
        tabs,
        activeTerminalId: 'terminal-1'
      })),
      subscribe: vi.fn(async ({ terminalId }) => ({
        terminalId,
        events: [],
        oldestSequence: 1,
        nextSequence: 1
      })),
      unsubscribe: vi.fn(async () => undefined),
      writeInput: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      onEvent: vi.fn((listener) => {
        terminalEventListener = listener
        return () => undefined
      })
    }

    render(<TerminalTool context={context} />)

    expect(
      await screen.findByRole('tab', { name: 'Select terminal tab api', selected: true })
    ).toBeVisible()
    expect(screen.getAllByRole('tab', { name: 'Select terminal tab api' })).toHaveLength(2)
    await waitFor(() => expect(window.spacezero.terminal.onEvent).toHaveBeenCalled())
    act(() =>
      terminalEventListener?.({
        type: 'output',
        terminalId: 'terminal-1',
        sequence: 1,
        data: '\u001B]0;malicious shell title\u0007'
      })
    )
    expect(screen.getAllByRole('tab', { name: 'Select terminal tab api' })).toHaveLength(2)

    act(() =>
      terminalEventListener?.({ type: 'tab-updated', terminalId: 'terminal-1', title: 'web' })
    )

    await screen.findByRole('tab', { name: 'Select terminal tab web', selected: true })
    expect(
      screen.getByRole('tab', { name: 'Select terminal tab api', selected: false })
    ).toBeVisible()
  })

  it('renders restored cwd fallback diagnostics from the create result', async () => {
    window.spacezero.terminal = {
      ...terminalApiDefaults,
      create: vi.fn(async () => ({
        status: 'running' as const,
        terminalId: 'terminal-1',
        tabs: [{ terminalId: 'terminal-1', title: 'zsh' }],
        activeTerminalId: 'terminal-1',
        diagnostics: [
          {
            type: 'cwd-fallback' as const,
            terminalId: 'terminal-1',
            savedCwd: '/missing',
            cwd: '/repo',
            message: 'Restored terminal cwd was unavailable; using /repo.'
          }
        ]
      })),
      subscribe: vi.fn(async ({ terminalId }) => ({
        terminalId,
        events: [],
        oldestSequence: 1,
        nextSequence: 1
      })),
      unsubscribe: vi.fn(async () => undefined),
      writeInput: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      onEvent: vi.fn(() => () => undefined)
    }

    render(<TerminalTool context={context} />)

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Restored terminal cwd was unavailable; using /repo.'
    )
  })

  it('falls back to the shell name supplied by main when no usable cwd label exists', async () => {
    window.spacezero.terminal = {
      ...terminalApiDefaults,
      create: vi.fn(async () => ({
        status: 'running' as const,
        terminalId: 'terminal-1',
        tabs: [{ terminalId: 'terminal-1', title: 'zsh' }],
        activeTerminalId: 'terminal-1'
      })),
      subscribe: vi.fn(async ({ terminalId }) => ({
        terminalId,
        events: [],
        oldestSequence: 1,
        nextSequence: 1
      })),
      unsubscribe: vi.fn(async () => undefined),
      writeInput: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      onEvent: vi.fn(() => () => undefined)
    }

    render(<TerminalTool context={context} />)

    await screen.findByRole('tab', { name: 'Select terminal tab zsh', selected: true })
  })

  it('removes inactive natural exits without changing the active tab while a sibling remains', async () => {
    const tabs = [
      { terminalId: 'terminal-1', title: 'one' },
      { terminalId: 'terminal-2', title: 'two' }
    ]
    window.spacezero.terminal = {
      ...terminalApiDefaults,
      create: vi.fn(async () => ({
        status: 'running' as const,
        terminalId: 'terminal-1',
        tabs,
        activeTerminalId: 'terminal-1'
      })),
      subscribe: vi.fn(async ({ terminalId }) => ({
        terminalId,
        events: [],
        oldestSequence: 1,
        nextSequence: 1
      })),
      unsubscribe: vi.fn(async () => undefined),
      writeInput: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      onEvent: vi.fn((listener) => {
        terminalEventListener = listener
        return () => undefined
      })
    }

    render(<TerminalTool context={context} />)

    expect(
      await screen.findByRole('tab', { name: 'Select terminal tab one', selected: true })
    ).toBeVisible()
    await waitFor(() => expect(window.spacezero.terminal.onEvent).toHaveBeenCalled())
    act(() =>
      terminalEventListener?.({ type: 'exit', terminalId: 'terminal-2', exitCode: 0, signal: null })
    )
    await waitFor(() =>
      expect(
        screen.getByRole('tab', { name: 'Select terminal tab one', selected: true })
      ).toBeVisible()
    )
    await waitFor(() =>
      expect(screen.queryByRole('tab', { name: 'Select terminal tab two' })).not.toBeInTheDocument()
    )
    expect(window.spacezero.terminal.selectTab).not.toHaveBeenCalled()
  })

  it('selects a sibling when the active tab exits naturally', async () => {
    const tabs = [
      { terminalId: 'terminal-1', title: 'one' },
      { terminalId: 'terminal-2', title: 'two' }
    ]
    window.spacezero.terminal = {
      ...terminalApiDefaults,
      create: vi.fn(async () => ({
        status: 'running' as const,
        terminalId: 'terminal-1',
        tabs,
        activeTerminalId: 'terminal-1'
      })),
      subscribe: vi.fn(async ({ terminalId }) => ({
        terminalId,
        events: [],
        oldestSequence: 1,
        nextSequence: 1
      })),
      unsubscribe: vi.fn(async () => undefined),
      writeInput: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      onEvent: vi.fn((listener) => {
        terminalEventListener = listener
        return () => undefined
      })
    }

    render(<TerminalTool context={context} />)

    expect(
      await screen.findByRole('tab', { name: 'Select terminal tab one', selected: true })
    ).toBeVisible()
    await waitFor(() => expect(window.spacezero.terminal.onEvent).toHaveBeenCalled())
    act(() =>
      terminalEventListener?.({ type: 'exit', terminalId: 'terminal-1', exitCode: 0, signal: null })
    )

    await screen.findByRole('tab', { name: 'Select terminal tab two', selected: true })
    expect(screen.queryByRole('tab', { name: 'Select terminal tab one' })).not.toBeInTheDocument()
  })

  it('saves and unsubscribes the source terminal when switching tabs', async () => {
    const tabs = [
      { terminalId: 'terminal-1', title: 'one' },
      { terminalId: 'terminal-2', title: 'two' }
    ]
    const unsubscribe = vi.fn(async () => undefined)
    window.spacezero.terminal = {
      ...terminalApiDefaults,
      create: vi.fn(async () => ({
        status: 'running' as const,
        terminalId: 'terminal-1',
        tabs,
        activeTerminalId: 'terminal-1'
      })),
      selectTab: vi.fn(async ({ terminalId }) => ({ tabs, activeTerminalId: terminalId })),
      subscribe: vi.fn(async ({ terminalId }) => ({
        terminalId,
        events: [],
        oldestSequence: 1,
        nextSequence: 1
      })),
      unsubscribe,
      writeInput: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      onEvent: vi.fn(() => () => undefined)
    }

    render(<TerminalTool context={context} />)

    await screen.findByRole('tab', { name: 'Select terminal tab one', selected: true })
    await waitFor(() => expect(window.spacezero.terminal.subscribe).toHaveBeenCalled())
    lastTerminal!.buffer.active.viewportY = 12
    await userEvent.click(screen.getByRole('tab', { name: 'Select terminal tab two' }))

    await waitFor(() =>
      expect(unsubscribe).toHaveBeenCalledWith({ terminalId: 'terminal-1', context })
    )
    await screen.findByRole('tab', { name: 'Select terminal tab two', selected: true })
    await userEvent.click(screen.getByRole('tab', { name: 'Select terminal tab one' }))
    await waitFor(() => expect(lastTerminal?.scrollToLine).toHaveBeenCalledWith(12))
  })

  it('restores viewport after unmount/remount only after asynchronous replay writes are parsed', async () => {
    const create = vi.fn(async () => ({ status: 'running' as const, terminalId: 'terminal-1' }))
    const subscribe = vi
      .fn()
      .mockResolvedValueOnce({
        terminalId: 'terminal-1',
        events: [],
        oldestSequence: 1,
        nextSequence: 1
      })
      .mockResolvedValueOnce({
        terminalId: 'terminal-1',
        events: [
          { type: 'output' as const, terminalId: 'terminal-1', sequence: 1, data: 'replay\r\n' }
        ],
        oldestSequence: 1,
        nextSequence: 2
      })
    window.spacezero.terminal = {
      ...terminalApiDefaults,
      create,
      subscribe,
      unsubscribe: vi.fn(async () => undefined),
      writeInput: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      onEvent: vi.fn(() => () => undefined)
    }

    const mounted = render(<TerminalTool context={context} />)
    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(1))
    lastTerminal!.buffer.active.viewportY = 23
    mounted.unmount()

    deferWriteCallbacks = true
    render(<TerminalTool context={context} />)
    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(2))
    expect(lastTerminal?.scrollToLine).not.toHaveBeenCalledWith(23)
    act(() => {
      for (const callback of pendingWriteCallbacks.splice(0)) callback()
    })
    await waitFor(() => expect(lastTerminal?.scrollToLine).toHaveBeenCalledWith(23))
  })

  it('treats add-terminal as one-shot and keeps live tabs visible when the add fails', async () => {
    const user = userEvent.setup()
    const create = vi
      .fn()
      .mockResolvedValueOnce({ status: 'running' as const, terminalId: 'terminal-1' })
      .mockRejectedValueOnce(new Error('terminal.shellLaunchFailed: ENOENT'))
      .mockResolvedValueOnce({ status: 'running' as const, terminalId: 'workspace-terminal' })
    window.spacezero.terminal = {
      ...terminalApiDefaults,
      create,
      subscribe: vi.fn(async ({ terminalId }) => ({
        terminalId,
        events: [],
        oldestSequence: 1,
        nextSequence: 1
      })),
      unsubscribe: vi.fn(async () => undefined),
      writeInput: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      onEvent: vi.fn(() => () => undefined)
    }

    const mounted = render(<TerminalTool context={context} />)
    expect(await screen.findByRole('button', { name: 'Close Terminal' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Add terminal tab' }))
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('button', { name: 'Close Terminal' })).toBeVisible()

    const workspaceContext = { kind: 'workspace-session' as const, sessionId: 'workspace-1' }
    mounted.rerender(<TerminalTool context={workspaceContext} />)
    await waitFor(() => expect(create).toHaveBeenCalledTimes(3))
    expect(create).toHaveBeenLastCalledWith({
      context: workspaceContext,
      cols: undefined,
      rows: undefined,
      forceNew: false
    })
  })

  it('shows an actionable launch failure instead of silently substituting another shell', async () => {
    window.spacezero.terminal = {
      ...terminalApiDefaults,
      create: vi.fn(async () => {
        throw new Error('terminal.shellLaunchFailed: ENOENT')
      }),
      subscribe: vi.fn(async () => ({
        terminalId: 'terminal-1',
        events: [],
        oldestSequence: 1,
        nextSequence: 1
      })),
      unsubscribe: vi.fn(async () => undefined),
      writeInput: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      onEvent: vi.fn(() => () => undefined)
    }

    render(<TerminalTool context={context} />)

    expect(await screen.findByText('Terminal failed to start')).toBeVisible()
    expect(screen.getByText('terminal.shellLaunchFailed: ENOENT')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
  })
})

class FakeXTerm {
  readonly write = vi.fn((_data: string, callback?: () => void) => {
    if (!callback) return
    if (deferWriteCallbacks) pendingWriteCallbacks.push(callback)
    else callback()
  })
  readonly open = vi.fn()
  readonly loadAddon = vi.fn()
  readonly dispose = vi.fn()
  readonly scrollToLine = vi.fn((line: number) => {
    this.buffer.active.viewportY = line
  })
  cols = 100
  private lines: FakeBufferLine[] = [new FakeBufferLine('')]
  readonly buffer = {
    active: {
      viewportY: 0,
      getLine: (lineNumber: number) => this.lines[lineNumber]
    }
  }
  readonly linkProviders: Array<{
    provideLinks: (
      line: number,
      callback: (
        links: Array<{
          text: string
          range: { start: { x: number; y: number }; end: { x: number; y: number } }
          activate: (event: MouseEvent, text: string) => void
        }>
      ) => void
    ) => void
  }> = []
  private dataListener: ((data: string) => void) | null = null

  registerLinkProvider(provider: {
    provideLinks: (
      line: number,
      callback: (
        links: Array<{
          text: string
          range: { start: { x: number; y: number }; end: { x: number; y: number } }
          activate: (event: MouseEvent, text: string) => void
        }>
      ) => void
    ) => void
  }): { dispose: () => void } {
    this.linkProviders.push(provider)
    return { dispose: vi.fn() }
  }

  setLines(lines: Array<string | { text: string; isWrapped: boolean }>): void {
    this.lines = lines.map((line) =>
      typeof line === 'string'
        ? new FakeBufferLine(line, false, this.cols)
        : new FakeBufferLine(line.text, line.isWrapped, this.cols)
    )
  }

  onData(listener: (data: string) => void): { dispose: () => void } {
    this.dataListener = listener
    return { dispose: vi.fn() }
  }

  emitData(data: string): void {
    this.dataListener?.(data)
  }
}

class FakeBufferLine {
  readonly length: number
  private readonly cells: Array<{ chars: string; width: number }>

  constructor(
    private readonly text: string,
    readonly isWrapped = false,
    columns = 100
  ) {
    this.cells = []
    for (const char of text) {
      const width = char === '界' ? 2 : 1
      this.cells.push({ chars: char, width })
      if (width === 2) this.cells.push({ chars: '', width: 0 })
    }
    while (this.cells.length < columns) this.cells.push({ chars: '', width: 1 })
    this.length = this.cells.length
  }

  getCell(column: number): { getChars: () => string; getWidth: () => number } | undefined {
    const cell = this.cells[column]
    if (!cell) return undefined
    return {
      getChars: () => cell.chars,
      getWidth: () => cell.width
    }
  }

  translateToString(trimRight = false): string {
    const value = this.text
    return trimRight ? value.trimEnd() : value
  }
}
