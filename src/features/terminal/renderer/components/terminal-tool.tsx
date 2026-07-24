import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal as XTerm } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

import { Button } from '@renderer/components/ui/button'

import type { TerminalContext, TerminalEvent } from '../../shared'

type TerminalToolProps = {
  context: TerminalContext
}

type TerminalStatus = 'starting' | 'running' | 'empty' | 'failed'

export function TerminalTool({ context }: TerminalToolProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const terminalIdRef = useRef<string | null>(null)
  const lastSequenceRef = useRef(0)
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

  const applyTerminalEvent = useCallback((event: TerminalEvent): void => {
    if (event.type === 'output') {
      if (event.sequence <= lastSequenceRef.current) return
      lastSequenceRef.current = event.sequence
      xtermRef.current?.write(event.data)
      return
    }
    terminalIdRef.current = null
    setTerminalId(null)
    setStatus('empty')
  }, [])

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

    async function createAndSubscribe(): Promise<void> {
      try {
        const dimensions = fitTerminal()
        const created = await window.spacezero.terminal.create({
          context: terminalContext,
          cols: dimensions?.cols,
          rows: dimensions?.rows
        })
        if (cancelled) return
        terminalIdRef.current = created.terminalId
        setTerminalId(created.terminalId)
        const subscription = await window.spacezero.terminal.subscribe({
          terminalId: created.terminalId,
          context: terminalContext
        })
        if (cancelled) return
        for (const event of subscription.events) applyTerminalEvent(event)
        lastSequenceRef.current = subscription.nextSequence - 1
        setStatus('running')
        void resizeTerminal()
      } catch (caught) {
        if (cancelled) return
        setStatus('failed')
        setError(caught instanceof Error ? caught.message : 'Terminal failed to start')
      }
    }

    void createAndSubscribe()

    const removeEventListener = window.spacezero.terminal.onEvent((event) => {
      if (event.terminalId !== terminalIdRef.current) return
      applyTerminalEvent(event)
    })

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
