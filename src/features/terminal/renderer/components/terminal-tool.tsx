import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal as XTerm } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

import { Button } from '@renderer/components/ui/button'

import type { TerminalContext, TerminalEvent, TerminalOutputEvent, TerminalTab } from '../../shared'

type TerminalToolProps = {
  context: TerminalContext
}

type TerminalStatus = 'starting' | 'running' | 'empty' | 'failed'

type SubscriptionState = {
  terminalId: string
  phase: 'subscribing' | 'running'
  buffer: TerminalEvent[]
}

const viewportByContext = new Map<string, Map<string, number>>()

export function TerminalTool({ context }: TerminalToolProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
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
  const terminalContextKey = useMemo(() => terminalContextIdentity(terminalContext), [terminalContext])
  const viewportByTerminal = getViewportStore(terminalContextKey)
  const [tabs, setTabs] = useState<TerminalTab[]>([])
  const [terminalId, setTerminalId] = useState<string | null>(null)
  const [status, setStatus] = useState<TerminalStatus>('starting')
  const [error, setError] = useState<string | null>(null)
  const [autoCreateToken, setAutoCreateToken] = useState(0)

  const startTerminal = useCallback(() => {
    forceCreateRequestedRef.current = true
    setError(null)
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

  const applyReplayOutputEvent = useCallback(async (xterm: XTerm, event: TerminalOutputEvent): Promise<void> => {
    const lastSequence = lastSequenceByTerminalRef.current.get(event.terminalId) ?? 0
    if (event.sequence <= lastSequence) return
    lastSequenceByTerminalRef.current.set(event.terminalId, event.sequence)
    await writeParsed(xterm, event.data)
  }, [])

  const applyTerminalEvent = useCallback(
    (event: TerminalEvent): void => {
      if (event.type === 'output') {
        applyOutputEvent(event)
        return
      }
      const exitedTerminalId = event.terminalId
      setTabs((currentTabs) => {
        if (!currentTabs.some((tab) => tab.terminalId === exitedTerminalId)) return currentTabs
        const wasActive = terminalIdRef.current === exitedTerminalId
        const nextTabs = currentTabs.filter((tab) => tab.terminalId !== exitedTerminalId)
        const nextActive = wasActive ? (nextTabs[0]?.terminalId ?? null) : terminalIdRef.current
        terminalIdRef.current = nextActive
        setTerminalId(nextActive)
        setStatus(nextActive ? 'running' : 'empty')
        if (wasActive) subscriptionRef.current = null
        return nextTabs
      })
    },
    [applyOutputEvent]
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
      if (contextChanged || !forceNew) {
        setStatus('starting')
        setTabs([])
        setTerminalId(null)
        terminalIdRef.current = null
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
        const createdTabs = created.tabs ?? (created.terminalId ? [{ terminalId: created.terminalId, title: 'Shell' }] : [])
        const activeTerminalId = created.activeTerminalId ?? created.terminalId
        setTabs(createdTabs)
        terminalIdRef.current = activeTerminalId
        setTerminalId(activeTerminalId)
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
  }, [autoCreateToken, fitTerminal, terminalContext, terminalContextKey])

  useEffect(() => {
    if (!terminalId) return

    let cancelled = false
    const xterm = new XTerm({ cursorBlink: true, convertEol: true, scrollback: 10_000 })
    const fitAddon = new FitAddon()
    xterm.loadAddon(fitAddon)
    xtermRef.current = xterm
    fitAddonRef.current = fitAddon
    terminalIdRef.current = terminalId

    if (containerRef.current) xterm.open(containerRef.current)

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
        const buffered = subscriptionRef.current?.buffer ?? []
        subscriptionRef.current = { terminalId: activeTerminalId, phase: 'running', buffer: [] }
        lastSequenceByTerminalRef.current.set(activeTerminalId, 0)
        for (const event of orderTerminalEvents([...subscription.events, ...buffered])) {
          if (event.type === 'output') await applyReplayOutputEvent(xterm, event)
          else applyTerminalEvent(event)
        }
        const lastSequence = lastSequenceByTerminalRef.current.get(activeTerminalId) ?? 0
        lastSequenceByTerminalRef.current.set(
          activeTerminalId,
          Math.max(lastSequence, subscription.nextSequence - 1)
        )
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
      dataSubscription.dispose()
      viewportByTerminal.set(activeTerminalId, readViewport(xterm))
      void window.spacezero.terminal.unsubscribe({ terminalId: activeTerminalId, context: terminalContext })
      subscriptionRef.current = null
      xterm.dispose()
      xtermRef.current = null
      fitAddonRef.current = null
    }
  }, [applyReplayOutputEvent, applyTerminalEvent, resizeTerminal, terminalContext, terminalId, viewportByTerminal])

  async function selectTerminal(nextTerminalId: string): Promise<void> {
    if (nextTerminalId === terminalId) return
    const snapshot = await window.spacezero.terminal.selectTab({
      terminalId: nextTerminalId,
      context: terminalContext
    })
    setTabs(snapshot.tabs)
    terminalIdRef.current = snapshot.activeTerminalId
    setTerminalId(snapshot.activeTerminalId)
  }

  async function closeTerminal(idToClose: string): Promise<void> {
    if (!window.confirm('Close this live terminal and terminate its shell?')) return
    await window.spacezero.terminal.close({ terminalId: idToClose, context: terminalContext })
    setTabs((currentTabs) => {
      const nextTabs = currentTabs.filter((tab) => tab.terminalId !== idToClose)
      const nextActive = idToClose === terminalId ? (nextTabs[0]?.terminalId ?? null) : terminalId
      terminalIdRef.current = nextActive
      setTerminalId(nextActive)
      setStatus(nextActive ? 'running' : 'empty')
      return nextTabs
    })
  }

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

  return (
    <section aria-label="Terminal" className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-10 shrink-0 items-center justify-between border-b px-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="shrink-0 text-sm font-medium">Terminal</div>
          {tabs.length > 0 ? (
            <div aria-label="Terminal tabs" role="tablist" className="flex min-w-0 items-center gap-1 overflow-x-auto">
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
                    aria-label={tab.terminalId === terminalId ? 'Close Terminal' : `Close terminal tab ${tab.title}`}
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
          {status === 'starting' ? (
            <div className="pointer-events-none absolute inset-12 text-xs text-muted-foreground">
              Starting terminal…
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
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
