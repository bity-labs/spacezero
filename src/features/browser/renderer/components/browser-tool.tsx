import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { Button } from '@renderer/components/ui/button'

import type { BrowserContext, BrowserState } from '../../shared'

export function BrowserTool({
  contextKey,
  context
}: {
  contextKey: string
  context: BrowserContext
}): React.JSX.Element {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<BrowserState | null>(null)
  const [address, setAddress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const activeTab = state?.tabs.find((tab) => tab.id === state.activeTabId) ?? state?.tabs[0]

  useEffect(() => {
    let cancelled = false
    void window.spacezero.browser
      .getState({ contextKey, context })
      .then((nextState) => {
        if (cancelled) return
        setState(nextState)
        const tab = nextState.tabs.find((candidate) => candidate.id === nextState.activeTabId)
        setAddress(tab?.url ?? '')
        window.requestAnimationFrame(() => inputRef.current?.focus())
      })
      .catch((reason: unknown) => setError(toErrorMessage(reason)))

    return () => {
      cancelled = true
      void window.spacezero.browser.hide({ contextKey, context })
    }
  }, [context, contextKey])

  useLayoutEffect(() => {
    const surface = surfaceRef.current
    const tab = activeTab
    if (!surface || !tab) return
    const surfaceElement = surface
    const activeTabId = tab.id

    function syncBounds(): void {
      const rect = surfaceElement.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return
      void window.spacezero.browser
        .show({
          contextKey,
          context,
          tabId: activeTabId,
          bounds: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          }
        })
        .then(setState)
        .catch((reason: unknown) => setError(toErrorMessage(reason)))
    }

    syncBounds()
    const observer = new ResizeObserver(syncBounds)
    observer.observe(surfaceElement)
    window.addEventListener('resize', syncBounds)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', syncBounds)
      void window.spacezero.browser.hide({ contextKey, context })
    }
  }, [activeTab, context, contextKey])

  async function submitNavigation(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setError(null)
    try {
      const nextState = await window.spacezero.browser.navigate({
        contextKey,
        context,
        tabId: activeTab?.id,
        input: address
      })
      setState(nextState)
      const tab = nextState.tabs.find((candidate) => candidate.id === nextState.activeTabId)
      setAddress(tab?.url ?? address)
    } catch (reason) {
      setError(toErrorMessage(reason))
    }
  }

  return (
    <section aria-label="Browser" className="flex h-full min-h-0 flex-col bg-background">
      <form className="flex shrink-0 items-center gap-2 border-b p-2" onSubmit={submitNavigation}>
        <input
          ref={inputRef}
          aria-label="Browser URL"
          className="h-8 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
          placeholder="Enter an HTTP, HTTPS, localhost, or loopback URL"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
        />
        <Button size="sm" type="submit">
          Go
        </Button>
      </form>
      {error ? <p className="shrink-0 border-b px-3 py-2 text-sm text-destructive">{error}</p> : null}
      {!activeTab?.url ? (
        <div className="pointer-events-none absolute inset-x-0 top-24 text-center text-sm text-muted-foreground">
          Enter a URL to open a secure Browser page.
        </div>
      ) : null}
      <div ref={surfaceRef} aria-label="Browser page surface" className="min-h-0 flex-1" />
    </section>
  )
}

function toErrorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'Browser request failed.'
}
