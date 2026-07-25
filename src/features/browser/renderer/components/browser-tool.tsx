import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { useRegisterAppCommands } from '../../../app-commands/renderer/app-command-context'
import { useKeyboardShortcutsManager, useRegisterKeyboardShortcuts } from '../../../keyboard-shortcuts/renderer/keyboard-shortcut-provider'
import { Button } from '@renderer/components/ui/button'

import { BROWSER_COMMAND_IDS, type BrowserContext, type BrowserState } from '../../shared'

const browserShortcutDefinitions = [
  {
    commandId: BROWSER_COMMAND_IDS.focusAddress,
    defaultKeybinding: { normalized: 'mod+l' },
    when: (ctx: { browserFocused: boolean }) => ctx.browserFocused,
    allowInTextInput: true
  },
  {
    commandId: BROWSER_COMMAND_IDS.reload,
    defaultKeybinding: { normalized: 'mod+r' },
    when: (ctx: { browserFocused: boolean }) => ctx.browserFocused
  },
  {
    commandId: BROWSER_COMMAND_IDS.back,
    defaultKeybinding: { normalized: 'alt+arrowleft' },
    when: (ctx: { browserFocused: boolean }) => ctx.browserFocused
  },
  {
    commandId: BROWSER_COMMAND_IDS.forward,
    defaultKeybinding: { normalized: 'alt+arrowright' },
    when: (ctx: { browserFocused: boolean }) => ctx.browserFocused
  }
] as const

export function BrowserTool({
  contextKey,
  context
}: {
  contextKey: string
  context: BrowserContext
}): React.JSX.Element {
  const rootRef = useRef<HTMLElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const shortcutManager = useKeyboardShortcutsManager()
  const [state, setState] = useState<BrowserState | null>(null)
  const [address, setAddress] = useState('')
  const [isEditingAddress, setIsEditingAddress] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const activeTab = state?.tabs.find((tab) => tab.id === state.activeTabId) ?? state?.tabs[0]
  const activeTabId = activeTab?.id
  const activeTabUrl = activeTab?.url ?? ''

  const tabRequest = useCallback(
    () => ({ contextKey, context, tabId: activeTabId }),
    [activeTabId, context, contextKey]
  )

  const focusAddressField = useCallback(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const navigateToInput = useCallback(
    async (input: string): Promise<void> => {
      setError(null)
      try {
        const nextState = await window.spacezero.browser.navigate({
          contextKey,
          context,
          tabId: activeTabId,
          input
        })
        setState(nextState)
        const tab = nextState.tabs.find((candidate) => candidate.id === nextState.activeTabId)
        setAddress(tab?.url ?? input)
        setIsEditingAddress(false)
      } catch (reason) {
        setError(toErrorMessage(reason))
      }
    },
    [activeTabId, context, contextKey]
  )

  const reloadOrStop = useCallback(async (): Promise<void> => {
    if (!activeTab) return
    setError(null)
    try {
      const nextState = activeTab.isLoading
        ? await window.spacezero.browser.stop(tabRequest())
        : await window.spacezero.browser.reload(tabRequest())
      setState(nextState)
    } catch (reason) {
      setError(toErrorMessage(reason))
    }
  }, [activeTab, tabRequest])

  const goBack = useCallback(async (): Promise<void> => {
    if (!activeTab?.canGoBack) return
    setError(null)
    try {
      setState(await window.spacezero.browser.goBack(tabRequest()))
    } catch (reason) {
      setError(toErrorMessage(reason))
    }
  }, [activeTab?.canGoBack, tabRequest])

  const goForward = useCallback(async (): Promise<void> => {
    if (!activeTab?.canGoForward) return
    setError(null)
    try {
      setState(await window.spacezero.browser.goForward(tabRequest()))
    } catch (reason) {
      setError(toErrorMessage(reason))
    }
  }, [activeTab?.canGoForward, tabRequest])

  const openInDefaultBrowser = useCallback(async (): Promise<void> => {
    if (!activeTabUrl) return
    setError(null)
    try {
      await window.spacezero.browser.openInDefaultBrowser(tabRequest())
    } catch (reason) {
      setError(toErrorMessage(reason))
    }
  }, [activeTabUrl, tabRequest])

  const retry = useCallback(async (): Promise<void> => {
    if (!activeTabUrl) return
    await navigateToInput(activeTabUrl)
  }, [activeTabUrl, navigateToInput])

  const commands = useMemo(
    () => [
      {
        id: BROWSER_COMMAND_IDS.focusAddress,
        title: 'Focus Browser address field',
        category: 'Browser',
        keywords: ['url', 'location', 'address'],
        handler: focusAddressField
      },
      {
        id: BROWSER_COMMAND_IDS.reload,
        title: 'Reload Browser page',
        category: 'Browser',
        keywords: ['refresh', 'stop'],
        handler: reloadOrStop
      },
      {
        id: BROWSER_COMMAND_IDS.back,
        title: 'Browser Back',
        category: 'Browser',
        handler: goBack
      },
      {
        id: BROWSER_COMMAND_IDS.forward,
        title: 'Browser Forward',
        category: 'Browser',
        handler: goForward
      }
    ],
    [focusAddressField, goBack, goForward, reloadOrStop]
  )
  useRegisterAppCommands(commands)
  useRegisterKeyboardShortcuts(browserShortcutDefinitions)

  useEffect(() => {
    let cancelled = false
    void window.spacezero.browser
      .getState({ contextKey, context })
      .then((nextState) => {
        if (cancelled) return
        setState(nextState)
        const tab = nextState.tabs.find((candidate) => candidate.id === nextState.activeTabId)
        setAddress(tab?.url ?? '')
        inputRef.current?.focus()
      })
      .catch((reason: unknown) => setError(toErrorMessage(reason)))

    return () => {
      cancelled = true
      shortcutManager.setContext({ browserFocused: false })
      void window.spacezero.browser.hide({ contextKey, context })
    }
  }, [context, contextKey, focusAddressField, shortcutManager])

  useEffect(() => {
    if (!isEditingAddress && document.activeElement !== inputRef.current) setAddress(activeTabUrl)
  }, [activeTabUrl, isEditingAddress])

  useLayoutEffect(() => {
    const surface = surfaceRef.current
    if (!surface || !activeTabId) return
    const surfaceElement = surface
    const shownTabId = activeTabId

    function syncBounds(): void {
      const rect = surfaceElement.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return
      void window.spacezero.browser
        .show({
          contextKey,
          context,
          tabId: shownTabId,
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
  }, [activeTabId, context, contextKey])

  async function submitNavigation(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    await navigateToInput(address)
  }

  const chromeError = activeTab?.error ?? error

  return (
    <section
      ref={rootRef}
      aria-label="Browser"
      className="flex h-full min-h-0 flex-col bg-background"
      onFocusCapture={() => shortcutManager.setContext({ browserFocused: true })}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          shortcutManager.setContext({ browserFocused: false })
        }
      }}
    >
      <form className="flex shrink-0 items-center gap-2 border-b p-2" onSubmit={submitNavigation}>
        <Button
          aria-label="Back"
          disabled={!activeTab?.canGoBack}
          size="sm"
          type="button"
          variant="outline"
          onClick={() => void goBack()}
        >
          ←
        </Button>
        <Button
          aria-label="Forward"
          disabled={!activeTab?.canGoForward}
          size="sm"
          type="button"
          variant="outline"
          onClick={() => void goForward()}
        >
          →
        </Button>
        <Button
          aria-label={activeTab?.isLoading ? 'Stop' : 'Reload'}
          disabled={!activeTab?.url && !activeTab?.isLoading}
          size="sm"
          type="button"
          variant="outline"
          onClick={() => void reloadOrStop()}
        >
          {activeTab?.isLoading ? 'Stop' : 'Reload'}
        </Button>
        <input
          ref={inputRef}
          aria-label="Browser URL"
          className="h-8 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
          placeholder="Enter a URL or search terms"
          value={address}
          onChange={(event) => {
            setIsEditingAddress(true)
            setAddress(event.target.value)
          }}
          onFocus={() => setIsEditingAddress(true)}
        />
        <Button size="sm" type="submit">
          Go
        </Button>
        <Button
          disabled={!activeTab?.url}
          size="sm"
          type="button"
          variant="outline"
          onClick={() => void openInDefaultBrowser()}
        >
          Open in default browser
        </Button>
      </form>
      {activeTab?.isLoading ? (
        <p className="shrink-0 border-b px-3 py-2 text-sm text-muted-foreground">Loading…</p>
      ) : null}
      {chromeError ? (
        <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2 text-sm text-destructive">
          <span>{chromeError}</span>
          {activeTab?.url ? (
            <Button size="sm" type="button" variant="outline" onClick={() => void retry()}>
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}
      {!activeTab?.url ? (
        <div className="pointer-events-none absolute inset-x-0 top-24 text-center text-sm text-muted-foreground">
          Enter a URL or search terms to open a secure Browser page.
        </div>
      ) : null}
      <div ref={surfaceRef} aria-label="Browser page surface" className="min-h-0 flex-1" />
    </section>
  )
}

function toErrorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'Browser request failed.'
}
