import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal as XTerm } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

import { Button } from '@renderer/components/ui/button'

import type { TerminalContext, TerminalEvent, TerminalOutputEvent } from '../../shared'

type TerminalToolProps = {
  context: TerminalContext
}

type TerminalStatus = 'starting' | 'running' | 'empty' | 'failed'

type SubscriptionState = {
  terminalId: string
  phase: 'subscribing' | 'running'
  buffer: TerminalEvent[]
}

export function TerminalTool({ context }: TerminalToolProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const terminalIdRef = useRef<string | null>(null)
  const subscriptionRef = useRef<SubscriptionState | null>(null)
  const lastSequenceByTerminalRef = useRef(new Map<string, number>())
  const terminalContext = useMemo<TerminalContext>(
    () => ({ kind: 'project-session', sessionId: context.sessionId }),
    [context.sessionId]
  )
  const [terminalId, setTerminalId] = useState<string | null>(null)
  const [status, setStatus] = useState<TerminalStatus>('starting')
  const [error, setError] = useState<string | null>(null)
  const [autoCreateToken, setAutoCreateToken] = useState(0)

  const startTerminal = useCallback(() => {
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

  const applyTerminalEvent = useCallback(
    (event: TerminalEvent): void => {
      if (event.type === 'output') {
        applyOutputEvent(event)
        return
      }
      terminalIdRef.current = null
      subscriptionRef.current = null
      setTerminalId(null)
      setStatus('empty')
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
    const xterm = new XTerm({ cursorBlink: true, convertEol: true, scrollback: 10_000 })
    const fitAddon = new FitAddon()
    xterm.loadAddon(fitAddon)
    xtermRef.current = xterm
    fitAddonRef.current = fitAddon

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
      if (event.terminalId !== terminalIdRef.current) return
      const subscription = subscriptionRef.current
      if (subscription?.terminalId === event.terminalId && subscription.phase === 'subscribing') {
        subscription.buffer.push(event)
        return
      }
      applyTerminalEvent(event)
    })

    async function createAndSubscribe(): Promise<void> {
      try {
        const dimensions = fitTerminal()
        const created = await window.spacezero.terminal.create({
          context: terminalContext,
          cols: dimensions?.cols,
          rows: dimensions?.rows,
          forceNew: autoCreateToken > 0
        })
        if (cancelled) return
        if (created.status === 'empty') {
          terminalIdRef.current = null
          subscriptionRef.current = null
          setTerminalId(null)
          setStatus('empty')
          return
        }

        const createdTerminalId = created.terminalId
        if (terminalIdRef.current !== createdTerminalId) {
          lastSequenceByTerminalRef.current.set(createdTerminalId, 0)
        }
        terminalIdRef.current = createdTerminalId
        setTerminalId(createdTerminalId)
        subscriptionRef.current = {
          terminalId: createdTerminalId,
          phase: 'subscribing',
          buffer: []
        }

        const subscription = await window.spacezero.terminal.subscribe({
          terminalId: createdTerminalId,
          context: terminalContext,
          afterSequence: lastSequenceByTerminalRef.current.get(createdTerminalId) ?? 0
        })
        if (cancelled) return
        const buffered = subscriptionRef.current?.buffer ?? []
        subscriptionRef.current = { terminalId: createdTerminalId, phase: 'running', buffer: [] }
        for (const event of orderTerminalEvents([...subscription.events, ...buffered])) {
          applyTerminalEvent(event)
        }
        const lastSequence = lastSequenceByTerminalRef.current.get(createdTerminalId) ?? 0
        lastSequenceByTerminalRef.current.set(
          createdTerminalId,
          Math.max(lastSequence, subscription.nextSequence - 1)
        )
        if (terminalIdRef.current === createdTerminalId) {
          setStatus('running')
          void resizeTerminal()
        }
      } catch (caught) {
        if (cancelled) return
        setStatus('failed')
        setError(caught instanceof Error ? caught.message : 'Terminal failed to start')
      }
    }

    void createAndSubscribe()

    const observer = new ResizeObserver(() => {
      void resizeTerminal()
    })
    if (containerRef.current) observer.observe(containerRef.current)

    return () => {
      cancelled = true
      observer.disconnect()
      removeEventListener()
      dataSubscription.dispose()
      const currentTerminalId = terminalIdRef.current
      if (currentTerminalId) {
        void window.spacezero.terminal.unsubscribe({
          terminalId: currentTerminalId,
          context: terminalContext
        })
      }
      terminalIdRef.current = null
      subscriptionRef.current = null
      xterm.dispose()
      xtermRef.current = null
      fitAddonRef.current = null
    }
  }, [applyTerminalEvent, autoCreateToken, fitTerminal, resizeTerminal, terminalContext])

  async function closeTerminal(): Promise<void> {
    if (!terminalId) return
    if (!window.confirm('Close this live terminal and terminate its shell?')) return
    await window.spacezero.terminal.close({ terminalId, context: terminalContext })
    terminalIdRef.current = null
    subscriptionRef.current = null
    setTerminalId(null)
    setStatus('empty')
  }

  return (
    <section aria-label="Terminal" className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-10 shrink-0 items-center justify-between border-b px-3">
        <div className="text-sm font-medium">Terminal</div>
        {terminalId ? (
          <Button size="sm" variant="ghost" onClick={closeTerminal}>
            Close Terminal
          </Button>
        ) : null}
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
        <div className="min-h-0 flex-1 overflow-hidden p-2">
          <div ref={containerRef} aria-label="Project Session terminal" className="h-full" />
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
