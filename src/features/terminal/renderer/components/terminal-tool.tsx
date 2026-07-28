import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal as XTerm } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

import { Button } from '@renderer/components/ui/button'

import { useRegisterAppCommands } from '../../../app-commands/renderer/app-command-context'
import {
  useKeyboardShortcutsManager,
  useRegisterKeyboardShortcuts
} from '../../../keyboard-shortcuts/renderer/keyboard-shortcut-provider'
import type { BrowserContext } from '../../../browser/shared'
import {
  TERMINAL_COMMAND_IDS,
  type TerminalContext,
  type TerminalDiagnostic,
  type TerminalEvent,
  type TerminalOutputEvent,
  type TerminalTab,
  type TerminalUnsubscribeRequest
} from '../../shared'

const terminalShortcutDefinitions = [
  {
    commandId: TERMINAL_COMMAND_IDS.newTab,
    defaultKeybinding: { normalized: 'mod+t' },
    when: (ctx: { terminalFocused: boolean }) => ctx.terminalFocused,
    allowInTextInput: true
  },
  {
    commandId: TERMINAL_COMMAND_IDS.closeActiveTab,
    defaultKeybinding: { normalized: 'mod+w' },
    when: (ctx: { terminalFocused: boolean }) => ctx.terminalFocused,
    allowInTextInput: true
  }
] as const

type TerminalBrowserHandoff = {
  contextKey: string
  context: BrowserContext
  openBrowserTool: () => void
}

type TerminalToolProps = {
  context: TerminalContext
  browserHandoff?: TerminalBrowserHandoff
}

type TerminalStatus = 'starting' | 'running' | 'empty' | 'failed'

type SubscriptionState = {
  terminalId: string
  phase: 'subscribing' | 'running'
  buffer: TerminalEvent[]
}

const viewportByContext = new Map<string, Map<string, number>>()

export function TerminalTool({ context, browserHandoff }: TerminalToolProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const shortcutManager = useKeyboardShortcutsManager()
  const fitAddonRef = useRef<FitAddon | null>(null)
  const terminalIdRef = useRef<string | null>(null)
  const subscriptionRef = useRef<SubscriptionState | null>(null)
  const lastSequenceByTerminalRef = useRef(new Map<string, number>())
  const draggedTerminalIdRef = useRef<string | null>(null)
  const forceCreateRequestedRef = useRef(false)
  const previousTerminalContextKeyRef = useRef<string | null>(null)
  const terminalContextKind = context.kind
  const terminalContextSessionId = 'sessionId' in context ? context.sessionId : undefined
  const terminalContext = useMemo<TerminalContext>(() => {
    if (terminalContextKind === 'knowledge-base') return { kind: 'knowledge-base' }
    return { kind: terminalContextKind, sessionId: terminalContextSessionId ?? '' }
  }, [terminalContextKind, terminalContextSessionId])
  const terminalContextKey = useMemo(
    () => terminalContextIdentity(terminalContext),
    [terminalContext]
  )
  const viewportByTerminal = getViewportStore(terminalContextKey)
  const [tabs, setTabs] = useState<TerminalTab[]>([])
  const [activeTerminal, setActiveTerminal] = useState<{
    terminalId: string
    contextKey: string
  } | null>(null)
  const terminalId = activeTerminal?.terminalId ?? null
  const [status, setStatus] = useState<TerminalStatus>('starting')
  const [error, setError] = useState<string | null>(null)
  const [diagnostics, setDiagnostics] = useState<TerminalDiagnostic[]>([])
  const [autoCreateToken, setAutoCreateToken] = useState(0)
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null)

  const updateActiveTerminal = useCallback(
    (nextTerminalId: string | null): void => {
      terminalIdRef.current = nextTerminalId
      setActiveTerminal((current) => {
        if (nextTerminalId === null) return null
        if (current?.terminalId === nextTerminalId) return current
        return { terminalId: nextTerminalId, contextKey: terminalContextKey }
      })
    },
    [terminalContextKey]
  )

  const startTerminal = useCallback(() => {
    forceCreateRequestedRef.current = true
    setError(null)
    setDiagnostics([])
    setStatus('starting')
    setAutoCreateToken((value) => value + 1)
  }, [])

  const fitTerminal = useCallback((): { cols: number; rows: number } | null => {
    const fitAddon = fitAddonRef.current
    if (!fitAddon || !containerRef.current) return null
    fitAddon.fit()
    const proposed = fitAddon.proposeDimensions()
    if (!proposed) return null
    return { cols: proposed.cols, rows: proposed.rows }
  }, [])

  const applyOutputEvent = useCallback((event: TerminalOutputEvent): void => {
    const lastSequence = lastSequenceByTerminalRef.current.get(event.terminalId) ?? 0
    if (event.sequence <= lastSequence) return
    lastSequenceByTerminalRef.current.set(event.terminalId, event.sequence)
    xtermRef.current?.write(event.data)
  }, [])

  const applyReplayOutputEvent = useCallback(
    async (xterm: XTerm, event: TerminalOutputEvent): Promise<void> => {
      const lastSequence = lastSequenceByTerminalRef.current.get(event.terminalId) ?? 0
      if (event.sequence <= lastSequence) return
      lastSequenceByTerminalRef.current.set(event.terminalId, event.sequence)
      await writeParsed(xterm, event.data)
    },
    []
  )

  const applyTerminalEvent = useCallback(
    (event: TerminalEvent): void => {
      if (event.type === 'output') {
        applyOutputEvent(event)
        return
      }
      if (event.type === 'tab-updated') {
        setTabs((currentTabs) =>
          currentTabs.map((tab) =>
            tab.terminalId === event.terminalId ? { ...tab, title: event.title } : tab
          )
        )
        return
      }
      const exitedTerminalId = event.terminalId
      setTabs((currentTabs) => {
        if (!currentTabs.some((tab) => tab.terminalId === exitedTerminalId)) return currentTabs
        const wasActive = terminalIdRef.current === exitedTerminalId
        const nextTabs = currentTabs.filter((tab) => tab.terminalId !== exitedTerminalId)
        const nextActive = wasActive ? (nextTabs[0]?.terminalId ?? null) : terminalIdRef.current
        updateActiveTerminal(nextActive)
        setStatus(nextActive ? 'running' : 'empty')
        if (wasActive) subscriptionRef.current = null
        return nextTabs
      })
    },
    [applyOutputEvent, updateActiveTerminal]
  )

  const resizeTerminal = useCallback(async (): Promise<void> => {
    const dimensions = fitTerminal()
    const currentTerminalId = terminalIdRef.current
    if (!dimensions || !currentTerminalId) return
    await window.spacezero.terminal.resize({
      terminalId: currentTerminalId,
      context: terminalContext,
      ...dimensions
    })
  }, [fitTerminal, terminalContext])

  const openTerminalLink = useCallback(
    async (url: string): Promise<void> => {
      if (!browserHandoff) {
        setFallbackUrl(url)
        return
      }
      try {
        await window.spacezero.browser.createTab({
          contextKey: browserHandoff.contextKey,
          context: browserHandoff.context,
          input: url
        })
        const currentTerminalId = terminalIdRef.current
        const currentXterm = xtermRef.current
        if (currentTerminalId && currentXterm) {
          viewportByTerminal.set(currentTerminalId, readViewport(currentXterm))
        }
        browserHandoff.openBrowserTool()
      } catch {
        setFallbackUrl(url)
      }
    },
    [browserHandoff, setFallbackUrl, viewportByTerminal]
  )

  useEffect(() => {
    let cancelled = false
    const forceNew = forceCreateRequestedRef.current
    forceCreateRequestedRef.current = false
    const previousContextKey = previousTerminalContextKeyRef.current
    const contextChanged = previousContextKey !== terminalContextKey
    previousTerminalContextKeyRef.current = terminalContextKey
    queueMicrotask(() => {
      if (cancelled) return
      setError(null)
      setDiagnostics([])
      if (contextChanged || !forceNew) {
        setStatus('starting')
        setTabs([])
        updateActiveTerminal(null)
      }
    })

    async function createOrRestore(): Promise<void> {
      try {
        const dimensions = fitTerminal()
        const created = await window.spacezero.terminal.create({
          context: terminalContext,
          cols: dimensions?.cols,
          rows: dimensions?.rows,
          forceNew
        })
        if (cancelled) return
        const createdTabs =
          created.tabs ??
          (created.terminalId ? [{ terminalId: created.terminalId, title: 'Shell' }] : [])
        const activeTerminalId = created.activeTerminalId ?? created.terminalId
        setTabs(createdTabs)
        setDiagnostics(created.diagnostics ?? [])
        updateActiveTerminal(activeTerminalId)
        setStatus(created.status === 'empty' ? 'empty' : 'running')
      } catch (caught) {
        if (cancelled) return
        setError(caught instanceof Error ? caught.message : 'Terminal failed to start')
        setStatus(forceNew && terminalIdRef.current ? 'running' : 'failed')
      }
    }

    void createOrRestore()

    return () => {
      cancelled = true
    }
  }, [autoCreateToken, fitTerminal, terminalContext, terminalContextKey, updateActiveTerminal])

  useEffect(() => {
    if (!activeTerminal || activeTerminal.contextKey !== terminalContextKey) return
    const terminalId = activeTerminal.terminalId

    let cancelled = false
    const xterm = new XTerm({ cursorBlink: true, convertEol: true, scrollback: 10_000 })
    const fitAddon = new FitAddon()
    xterm.loadAddon(fitAddon)
    xtermRef.current = xterm
    fitAddonRef.current = fitAddon
    terminalIdRef.current = terminalId

    if (containerRef.current) xterm.open(containerRef.current)

    const linkProvider = registerTerminalLinkProvider(xterm, openTerminalLink)

    const dataSubscription = xterm.onData((data) => {
      const currentTerminalId = terminalIdRef.current
      if (!currentTerminalId) return
      void window.spacezero.terminal.writeInput({
        terminalId: currentTerminalId,
        context: terminalContext,
        data
      })
    })

    const removeEventListener = window.spacezero.terminal.onEvent((event) => {
      if (event.type === 'output' && event.terminalId !== activeTerminalId) return
      const subscription = subscriptionRef.current
      if (subscription?.terminalId === event.terminalId && subscription.phase === 'subscribing') {
        subscription.buffer.push(event)
        return
      }
      applyTerminalEvent(event)
    })

    const activeTerminalId = terminalId

    async function subscribe(): Promise<void> {
      try {
        subscriptionRef.current = { terminalId: activeTerminalId, phase: 'subscribing', buffer: [] }
        const subscription = await window.spacezero.terminal.subscribe({
          terminalId: activeTerminalId,
          context: terminalContext,
          afterSequence: 0
        })
        if (cancelled) return
        lastSequenceByTerminalRef.current.set(activeTerminalId, 0)
        let replayEvents = orderTerminalEvents(subscription.events)
        while (replayEvents.length > 0 || subscriptionRef.current?.buffer.length) {
          if (replayEvents.length === 0) {
            const buffered = subscriptionRef.current?.buffer.splice(0) ?? []
            replayEvents = orderTerminalEvents(buffered)
          }
          const event = replayEvents.shift()
          if (!event) continue
          if (event.type === 'output') await applyReplayOutputEvent(xterm, event)
          else applyTerminalEvent(event)
          if (cancelled || subscriptionRef.current?.terminalId !== activeTerminalId) return
        }
        if (cancelled) return
        subscriptionRef.current = { terminalId: activeTerminalId, phase: 'running', buffer: [] }
        const lastSequence = lastSequenceByTerminalRef.current.get(activeTerminalId) ?? 0
        lastSequenceByTerminalRef.current.set(
          activeTerminalId,
          Math.max(lastSequence, subscription.nextSequence - 1)
        )
        if (cancelled || terminalIdRef.current !== activeTerminalId) return
        setStatus('running')
        void resizeTerminal()
        restoreViewport(xterm, viewportByTerminal.get(activeTerminalId))
      } catch (caught) {
        if (cancelled) return
        setStatus('failed')
        setError(caught instanceof Error ? caught.message : 'Terminal failed to start')
      }
    }

    void subscribe()

    const observer = new ResizeObserver(() => {
      void resizeTerminal()
    })
    if (containerRef.current) observer.observe(containerRef.current)

    return () => {
      cancelled = true
      observer.disconnect()
      removeEventListener()
      linkProvider.dispose()
      dataSubscription.dispose()
      viewportByTerminal.set(activeTerminalId, readViewport(xterm))
      void unsubscribeTerminal({ terminalId: activeTerminalId, context: terminalContext })
      subscriptionRef.current = null
      xterm.dispose()
      xtermRef.current = null
      fitAddonRef.current = null
    }
  }, [
    activeTerminal,
    applyReplayOutputEvent,
    applyTerminalEvent,
    openTerminalLink,
    resizeTerminal,
    terminalContext,
    terminalContextKey,
    viewportByTerminal
  ])

  async function selectTerminal(nextTerminalId: string): Promise<void> {
    if (nextTerminalId === terminalId) return
    const snapshot = await window.spacezero.terminal.selectTab({
      terminalId: nextTerminalId,
      context: terminalContext
    })
    setTabs(snapshot.tabs)
    updateActiveTerminal(snapshot.activeTerminalId)
  }

  const closeTerminal = useCallback(
    async (idToClose: string): Promise<void> => {
      const settings = await window.spacezero.settings.getTerminalSettings()
      if (
        settings.confirmBeforeClosingLiveTerminals &&
        !window.confirm('Close this live terminal and terminate its shell?')
      ) {
        return
      }
      await window.spacezero.terminal.close({ terminalId: idToClose, context: terminalContext })
      setTabs((currentTabs) => {
        const nextTabs = currentTabs.filter((tab) => tab.terminalId !== idToClose)
        const nextActive = idToClose === terminalId ? (nextTabs[0]?.terminalId ?? null) : terminalId
        updateActiveTerminal(nextActive)
        setStatus(nextActive ? 'running' : 'empty')
        return nextTabs
      })
    },
    [terminalContext, terminalId, updateActiveTerminal]
  )

  const closeActiveTerminal = useCallback(async (): Promise<void> => {
    if (!terminalId) return
    await closeTerminal(terminalId)
  }, [closeTerminal, terminalId])

  async function reorderTabs(targetTerminalId: string): Promise<void> {
    const draggedTerminalId = draggedTerminalIdRef.current
    draggedTerminalIdRef.current = null
    if (!draggedTerminalId || draggedTerminalId === targetTerminalId) return
    const from = tabs.findIndex((tab) => tab.terminalId === draggedTerminalId)
    const to = tabs.findIndex((tab) => tab.terminalId === targetTerminalId)
    if (from < 0 || to < 0) return
    const nextTabs = [...tabs]
    const [dragged] = nextTabs.splice(from, 1)
    if (!dragged) return
    nextTabs.splice(to, 0, dragged)
    setTabs(nextTabs)
    const snapshot = await window.spacezero.terminal.reorderTabs({
      context: terminalContext,
      terminalIds: nextTabs.map((tab) => tab.terminalId)
    })
    setTabs(snapshot.tabs)
  }

  async function copyFallbackUrl(): Promise<void> {
    if (!fallbackUrl) return
    await navigator.clipboard.writeText(fallbackUrl)
    setFallbackUrl(null)
  }

  async function openFallbackUrlInDefaultBrowser(): Promise<void> {
    if (!fallbackUrl) return
    await window.spacezero.browser.openUrlInDefaultBrowser({ url: fallbackUrl })
    setFallbackUrl(null)
  }

  const commands = useMemo(
    () => [
      {
        id: TERMINAL_COMMAND_IDS.newTab,
        title: 'New Terminal',
        category: 'Terminal',
        keywords: ['new', 'tab', 'shell'],
        handler: startTerminal
      },
      {
        id: TERMINAL_COMMAND_IDS.closeActiveTab,
        title: 'Close Terminal Tab',
        category: 'Terminal',
        keywords: ['close', 'tab', 'shell'],
        handler: closeActiveTerminal
      }
    ],
    [startTerminal, closeActiveTerminal]
  )
  useRegisterAppCommands(commands)
  useRegisterKeyboardShortcuts(terminalShortcutDefinitions)

  return (
    <>
      <section
        aria-label="Terminal"
        className="flex h-full min-h-0 flex-col bg-background"
        onFocusCapture={() => shortcutManager.setContext({ terminalFocused: true })}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            shortcutManager.setContext({ terminalFocused: false })
          }
        }}
      >
        <div className="flex h-10 shrink-0 items-center justify-between border-b px-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="shrink-0 text-sm font-medium">Terminal</div>
            {tabs.length > 0 ? (
              <div
                aria-label="Terminal tabs"
                role="tablist"
                className="flex min-w-0 items-center gap-1 overflow-x-auto"
              >
                {tabs.map((tab) => (
                  <div
                    key={tab.terminalId}
                    draggable
                    onDragStart={() => {
                      draggedTerminalIdRef.current = tab.terminalId
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => void reorderTabs(tab.terminalId)}
                    className="flex shrink-0 items-center rounded-md border"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={tab.terminalId === terminalId}
                      aria-label={`Select terminal tab ${tab.title}`}
                      onClick={() => void selectTerminal(tab.terminalId)}
                      className="px-2 py-1 text-xs"
                    >
                      {tab.title}
                    </button>
                    <button
                      type="button"
                      aria-label={
                        tab.terminalId === terminalId
                          ? 'Close Terminal'
                          : `Close terminal tab ${tab.title}`
                      }
                      onClick={() => void closeTerminal(tab.terminalId)}
                      className="px-2 py-1 text-xs text-muted-foreground"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <Button size="sm" variant="ghost" aria-label="Add terminal tab" onClick={startTerminal}>
            New Terminal
          </Button>
        </div>
        {status === 'failed' ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
            <div>
              <p className="text-sm font-medium">Terminal failed to start</p>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">{error}</p>
            </div>
            <Button size="sm" onClick={startTerminal}>
              Retry
            </Button>
          </div>
        ) : status === 'empty' ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
            <p className="text-sm text-muted-foreground">New Terminal</p>
            <Button size="sm" onClick={startTerminal}>
              New Terminal
            </Button>
          </div>
        ) : (
          <div className="relative min-h-0 flex-1 overflow-hidden p-2">
            <div ref={containerRef} aria-label="Terminal output" className="h-full" />
            {diagnostics.length > 0 ? (
              <div
                role="status"
                className="absolute inset-x-4 top-4 rounded-md border bg-background/95 p-2 text-xs text-muted-foreground shadow-sm"
              >
                {diagnostics.map((diagnostic) => (
                  <p key={`${diagnostic.type}:${diagnostic.terminalId}`}>{diagnostic.message}</p>
                ))}
              </div>
            ) : null}
            {status === 'starting' ? (
              <div className="pointer-events-none absolute inset-12 text-xs text-muted-foreground">
                Starting terminal…
              </div>
            ) : null}
          </div>
        )}
      </section>
      {fallbackUrl ? (
        <div
          aria-label="Terminal Link choices"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/60"
          role="dialog"
        >
          <div className="max-w-md rounded-lg border bg-background p-4 shadow-lg">
            <p className="text-sm font-medium">Browser is unavailable</p>
            <p className="mt-2 break-all text-xs text-muted-foreground">{fallbackUrl}</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setFallbackUrl(null)}>
                Cancel
              </Button>
              <Button size="sm" variant="outline" onClick={() => void copyFallbackUrl()}>
                Copy URL
              </Button>
              <Button size="sm" onClick={() => void openFallbackUrlInDefaultBrowser()}>
                Open in default browser
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

function registerTerminalLinkProvider(
  xterm: XTerm,
  onOpenLink: (url: string) => Promise<void>
): { dispose: () => void } {
  if (!('registerLinkProvider' in xterm) || typeof xterm.registerLinkProvider !== 'function') {
    return { dispose: () => undefined }
  }

  return xterm.registerLinkProvider({
    provideLinks: (bufferLineNumber, callback) => {
      const logicalLine = readWrappedLogicalLine(xterm, bufferLineNumber)
      callback(findTerminalLinks(logicalLine, onOpenLink))
    }
  })
}

type TerminalCellPosition = { x: number; y: number }
type TerminalLogicalLine = {
  text: string
  cellsByStringIndex: TerminalCellPosition[]
}

function readWrappedLogicalLine(xterm: XTerm, bufferLineNumber: number): TerminalLogicalLine {
  const buffer = xterm.buffer.active
  const targetLineIndex = bufferLineNumber - 1
  let firstLineIndex = targetLineIndex
  while (firstLineIndex > 0 && buffer.getLine(firstLineIndex)?.isWrapped) {
    firstLineIndex -= 1
  }

  let lastLineIndex = targetLineIndex
  while (buffer.getLine(lastLineIndex + 1)?.isWrapped) {
    lastLineIndex += 1
  }

  const pieces: string[] = []
  const cellsByStringIndex: TerminalCellPosition[] = []
  for (let lineIndex = firstLineIndex; lineIndex <= lastLineIndex; lineIndex += 1) {
    appendPhysicalLine(xterm, lineIndex, pieces, cellsByStringIndex)
  }

  let text = pieces.join('')
  while (text.endsWith(' ')) {
    text = text.slice(0, -1)
    cellsByStringIndex.pop()
  }

  return { text, cellsByStringIndex }
}

function appendPhysicalLine(
  xterm: XTerm,
  lineIndex: number,
  pieces: string[],
  cellsByStringIndex: TerminalCellPosition[]
): void {
  const line = xterm.buffer.active.getLine(lineIndex)
  if (!line) return

  const maxColumn = Math.min(line.length, xterm.cols)
  for (let column = 0; column < maxColumn; column += 1) {
    const cell = line.getCell(column)
    if (!cell) continue
    if (cell.getWidth() === 0) continue

    const chars = cell.getChars() || ' '
    pieces.push(chars)
    for (let index = 0; index < chars.length; index += 1) {
      cellsByStringIndex.push({ x: column + 1, y: lineIndex + 1 })
    }
  }
}

function findTerminalLinks(
  logicalLine: TerminalLogicalLine,
  onOpenLink: (url: string) => Promise<void>
): Array<{
  text: string
  range: { start: { x: number; y: number }; end: { x: number; y: number } }
  activate: (event: MouseEvent, text: string) => void
}> {
  const links: Array<{
    text: string
    range: { start: { x: number; y: number }; end: { x: number; y: number } }
    activate: (event: MouseEvent, text: string) => void
  }> = []
  for (const match of logicalLine.text.matchAll(/https?:\/\/[^\s<>'"]+/gi)) {
    const raw = match[0]
    const url = trimTerminalLink(raw)
    if (!isValidTerminalLink(url)) continue
    const startIndex = match.index ?? 0
    const endIndex = startIndex + url.length - 1
    const start = logicalLine.cellsByStringIndex[startIndex]
    const end = logicalLine.cellsByStringIndex[endIndex]
    if (!start || !end) continue

    links.push({
      text: url,
      range: { start, end },
      activate: (event, text) => {
        if (!isModifierClick(event)) return
        void onOpenLink(text)
      }
    })
  }
  return links
}

function trimTerminalLink(url: string): string {
  return url.replace(/[),.;:!?]+$/u, '')
}

function isValidTerminalLink(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.length > 0
    )
  } catch {
    return false
  }
}

function isModifierClick(event: MouseEvent): boolean {
  return event.metaKey || event.ctrlKey
}

function orderTerminalEvents(events: TerminalEvent[]): TerminalEvent[] {
  return [...events].sort((left, right) => eventSequence(left) - eventSequence(right))
}

function eventSequence(event: TerminalEvent): number {
  return event.type === 'output' ? event.sequence : Number.MAX_SAFE_INTEGER
}

function readViewport(xterm: XTerm): number {
  return xterm.buffer?.active?.viewportY ?? 0
}

function restoreViewport(xterm: XTerm, viewport: number | undefined): void {
  if (viewport === undefined) return
  xterm.scrollToLine?.(viewport)
}

function writeParsed(xterm: XTerm, data: string): Promise<void> {
  return new Promise((resolve) => {
    xterm.write(data, resolve)
  })
}

async function unsubscribeTerminal(request: TerminalUnsubscribeRequest): Promise<void> {
  try {
    await window.spacezero.terminal.unsubscribe(request)
  } catch (caught) {
    if (caught instanceof Error && caught.message.includes('terminal.notFound')) return
    console.error('Terminal unsubscribe failed', caught)
  }
}

function getViewportStore(contextKey: string): Map<string, number> {
  let store = viewportByContext.get(contextKey)
  if (!store) {
    store = new Map()
    viewportByContext.set(contextKey, store)
  }
  return store
}

function terminalContextIdentity(context: TerminalContext): string {
  if (context.kind === 'knowledge-base') return context.kind
  return `${context.kind}:${context.sessionId}`
}
