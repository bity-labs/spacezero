import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { useRegisterAppCommands } from '../../../app-commands/renderer/app-command-context'
import { isMacPlatform } from '../../../keyboard-shortcuts/renderer/keybinding-parser'
import {
  useKeyboardShortcutsManager,
  useRegisterKeyboardShortcuts
} from '../../../keyboard-shortcuts/renderer/keyboard-shortcut-provider'
import { Button } from '@renderer/components/ui/button'

import {
  BROWSER_COMMAND_IDS,
  type BrowserContext,
  type BrowserDownloadSnapshot,
  type BrowserShortcutBinding,
  type BrowserState,
  type BrowserTab
} from '../../shared'

const browserShortcutDefinitions = [
  {
    commandId: BROWSER_COMMAND_IDS.focusAddress,
    defaultKeybinding: { normalized: 'mod+l' },
    when: (ctx: { browserFocused: boolean }) => ctx.browserFocused,
    allowInTextInput: true
  },
  {
    commandId: BROWSER_COMMAND_IDS.newTab,
    defaultKeybinding: { normalized: 'mod+t' },
    when: (ctx: { browserFocused: boolean }) => ctx.browserFocused,
    allowInTextInput: true
  },
  {
    commandId: BROWSER_COMMAND_IDS.closeActiveTab,
    defaultKeybinding: { normalized: 'mod+w' },
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
    defaultKeybinding: { normalized: isMacPlatform() ? 'mod+[' : 'alt+arrowleft' },
    when: (ctx: { browserFocused: boolean }) => ctx.browserFocused
  },
  {
    commandId: BROWSER_COMMAND_IDS.forward,
    defaultKeybinding: { normalized: isMacPlatform() ? 'mod+]' : 'alt+arrowright' },
    when: (ctx: { browserFocused: boolean }) => ctx.browserFocused
  }
] as const

function getBrowserNativeShortcutBindings(
  shortcutManager: ReturnType<typeof useKeyboardShortcutsManager>
): BrowserShortcutBinding[] {
  return browserShortcutDefinitions.map((definition) => ({
    commandId: definition.commandId,
    keybinding: shortcutManager.resolveKeybinding(definition)
  }))
}

type BrowserDownloadStoreListener = () => void

type BrowserDownloadStore = {
  api: typeof window.spacezero.browser | null
  unsubscribe: (() => void) | null
  downloadsById: Map<string, BrowserDownloadSnapshot>
  listeners: Set<BrowserDownloadStoreListener>
}

const browserDownloadStore: BrowserDownloadStore = {
  api: null,
  unsubscribe: null,
  downloadsById: new Map(),
  listeners: new Set()
}

function ensureBrowserDownloadSubscription(): void {
  const api = window.spacezero.browser
  if (browserDownloadStore.api === api && browserDownloadStore.unsubscribe) return
  browserDownloadStore.unsubscribe?.()
  browserDownloadStore.downloadsById.clear()
  browserDownloadStore.api = api
  browserDownloadStore.unsubscribe = api.onEvent((event) => {
    if (event.type !== 'download-updated') return
    browserDownloadStore.downloadsById.set(event.download.id, event.download)
    for (const listener of browserDownloadStore.listeners) listener()
  })
}

function subscribeToBrowserDownloads(listener: BrowserDownloadStoreListener): () => void {
  browserDownloadStore.listeners.add(listener)
  return () => browserDownloadStore.listeners.delete(listener)
}

function browserDownloadsForTabs(tabIds: Set<string>): BrowserDownloadSnapshot[] {
  return [...browserDownloadStore.downloadsById.values()]
    .filter((download) => tabIds.has(download.tabId))
    .slice(-4)
}

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
  const [stateContextKey, setStateContextKey] = useState(contextKey)
  const [shortcutBindingsVersion, setShortcutBindingsVersion] = useState(0)
  const [address, setAddress] = useState('')
  const [addressContextKey, setAddressContextKey] = useState(contextKey)
  const [isEditingAddress, setIsEditingAddress] = useState(false)
  const isEditingAddressRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [downloadsVersion, setDownloadsVersion] = useState(0)
  const tabStripRef = useRef<HTMLDivElement>(null)
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null)
  const contextState = stateContextKey === contextKey ? state : null
  const activeTab =
    contextState?.tabs.find((tab) => tab.id === contextState.activeTabId) ?? contextState?.tabs[0]
  const activeTabId = activeTab?.id
  const activeTabUrl = activeTab?.url ?? ''
  const downloads = useMemo(() => {
    void downloadsVersion
    return browserDownloadsForTabs(new Set(contextState?.tabs.map((tab) => tab.id) ?? []))
  }, [contextState, downloadsVersion])

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
        setStateContextKey(contextKey)
        const tab = nextState.tabs.find((candidate) => candidate.id === nextState.activeTabId)
        setAddress(tab?.url ?? input)
        setAddressContextKey(contextKey)
        isEditingAddressRef.current = false
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
      setStateContextKey(contextKey)
    } catch (reason) {
      setError(toErrorMessage(reason))
    }
  }, [activeTab, contextKey, tabRequest])

  const goBack = useCallback(async (): Promise<void> => {
    if (!activeTab?.canGoBack) return
    setError(null)
    try {
      setState(await window.spacezero.browser.goBack(tabRequest()))
      setStateContextKey(contextKey)
    } catch (reason) {
      setError(toErrorMessage(reason))
    }
  }, [activeTab?.canGoBack, contextKey, tabRequest])

  const goForward = useCallback(async (): Promise<void> => {
    if (!activeTab?.canGoForward) return
    setError(null)
    try {
      setState(await window.spacezero.browser.goForward(tabRequest()))
      setStateContextKey(contextKey)
    } catch (reason) {
      setError(toErrorMessage(reason))
    }
  }, [activeTab?.canGoForward, contextKey, tabRequest])

  const openInDefaultBrowser = useCallback(async (): Promise<void> => {
    if (!activeTabUrl) return
    setError(null)
    try {
      await window.spacezero.browser.openInDefaultBrowser(tabRequest())
    } catch (reason) {
      setError(toErrorMessage(reason))
    }
  }, [activeTabUrl, tabRequest])

  const openDownload = useCallback(async (downloadId: string): Promise<void> => {
    setError(null)
    try {
      await window.spacezero.browser.openDownload({ downloadId })
    } catch (reason) {
      setError(toErrorMessage(reason))
    }
  }, [])

  const revealDownload = useCallback(async (downloadId: string): Promise<void> => {
    setError(null)
    try {
      await window.spacezero.browser.revealDownload({ downloadId })
    } catch (reason) {
      setError(toErrorMessage(reason))
    }
  }, [])

  const createBlankTab = useCallback(async (): Promise<void> => {
    setError(null)
    try {
      const nextState = await window.spacezero.browser.createTab({ contextKey, context })
      setState(nextState)
      setStateContextKey(contextKey)
      setAddress('')
      setAddressContextKey(contextKey)
      isEditingAddressRef.current = false
      setIsEditingAddress(false)
      requestAnimationFrame(() => focusAddressField())
    } catch (reason) {
      setError(toErrorMessage(reason))
    }
  }, [context, contextKey, focusAddressField])

  const selectTab = useCallback(
    async (tabId: string): Promise<void> => {
      setError(null)
      try {
        const nextState = await window.spacezero.browser.selectTab({ contextKey, context, tabId })
        setState(nextState)
        setStateContextKey(contextKey)
      } catch (reason) {
        setError(toErrorMessage(reason))
      }
    },
    [context, contextKey]
  )

  const focusTab = useCallback((tabId: string): void => {
    requestAnimationFrame(() => {
      tabStripRef.current
        ?.querySelector<HTMLButtonElement>(`[data-browser-tab-id="${tabId}"]`)
        ?.focus()
    })
  }, [])

  const selectAndFocusTab = useCallback(
    async (tabId: string): Promise<void> => {
      await selectTab(tabId)
      focusTab(tabId)
    },
    [focusTab, selectTab]
  )

  const selectTabByKeyboard = useCallback(
    (currentTabId: string, key: string): void => {
      if (!contextState?.tabs.length) return
      const currentIndex = contextState.tabs.findIndex((tab) => tab.id === currentTabId)
      if (currentIndex < 0) return
      const lastIndex = contextState.tabs.length - 1
      const nextIndexByKey: Record<string, number> = {
        ArrowLeft: currentIndex === 0 ? lastIndex : currentIndex - 1,
        ArrowRight: currentIndex === lastIndex ? 0 : currentIndex + 1,
        Home: 0,
        End: lastIndex
      }
      const nextIndex = nextIndexByKey[key]
      const nextTabId = contextState.tabs[nextIndex]?.id
      if (!nextTabId) return
      void selectAndFocusTab(nextTabId)
    },
    [contextState, selectAndFocusTab]
  )

  const closeTab = useCallback(
    async (tabId: string): Promise<void> => {
      setError(null)
      try {
        const nextState = await window.spacezero.browser.closeTab({ contextKey, context, tabId })
        setState(nextState)
        setStateContextKey(contextKey)
        const nextActiveTab = nextState.tabs.find(
          (candidate) => candidate.id === nextState.activeTabId
        )
        if (!nextActiveTab?.url) requestAnimationFrame(() => focusAddressField())
      } catch (reason) {
        setError(toErrorMessage(reason))
      }
    },
    [context, contextKey, focusAddressField]
  )

  const closeActiveTab = useCallback(async (): Promise<void> => {
    if (!activeTabId) return
    await closeTab(activeTabId)
  }, [activeTabId, closeTab])

  const reorderTabs = useCallback(
    async (sourceTabId: string, targetTabId: string): Promise<void> => {
      if (!contextState || sourceTabId === targetTabId) return
      const sourceIndex = contextState.tabs.findIndex((tab) => tab.id === sourceTabId)
      const targetIndex = contextState.tabs.findIndex((tab) => tab.id === targetTabId)
      if (sourceIndex < 0 || targetIndex < 0) return
      const nextTabs = [...contextState.tabs]
      const [movedTab] = nextTabs.splice(sourceIndex, 1)
      if (!movedTab) return
      nextTabs.splice(targetIndex, 0, movedTab)
      const optimisticState = { ...contextState, tabs: nextTabs }
      setState(optimisticState)
      setStateContextKey(contextKey)
      try {
        setState(
          await window.spacezero.browser.reorderTabs({
            contextKey,
            context,
            tabIds: nextTabs.map((tab) => tab.id)
          })
        )
        setStateContextKey(contextKey)
      } catch (reason) {
        setState(contextState)
        setError(toErrorMessage(reason))
      }
    },
    [context, contextKey, contextState]
  )

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
        id: BROWSER_COMMAND_IDS.newTab,
        title: 'New Browser tab',
        category: 'Browser',
        keywords: ['open', 'tab'],
        handler: createBlankTab
      },
      {
        id: BROWSER_COMMAND_IDS.closeActiveTab,
        title: 'Close Browser tab',
        category: 'Browser',
        keywords: ['close', 'tab'],
        handler: closeActiveTab
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
    [closeActiveTab, createBlankTab, focusAddressField, goBack, goForward, reloadOrStop]
  )
  useRegisterAppCommands(commands)
  useRegisterKeyboardShortcuts(browserShortcutDefinitions)

  useEffect(
    () =>
      shortcutManager.onBindingsChanged(() => setShortcutBindingsVersion((version) => version + 1)),
    [shortcutManager]
  )

  useEffect(() => {
    let cancelled = false
    void window.spacezero.browser
      .getState({ contextKey, context })
      .then((nextState) => {
        if (cancelled) return
        setState(nextState)
        setStateContextKey(contextKey)
        const tab = nextState.tabs.find((candidate) => candidate.id === nextState.activeTabId)
        setAddress(tab?.url ?? '')
        setAddressContextKey(contextKey)
        isEditingAddressRef.current = false
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
    if (!isEditingAddressRef.current) {
      setAddress(activeTabUrl)
      setAddressContextKey(contextKey)
    }
  }, [activeTabUrl, contextKey, isEditingAddress])

  useEffect(() => {
    const activeElement = tabStripRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    activeElement?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeTabId])

  useEffect(() => {
    ensureBrowserDownloadSubscription()
    return subscribeToBrowserDownloads(() => {
      setDownloadsVersion((version) => version + 1)
    })
  }, [])

  useEffect(() => {
    return window.spacezero.browser.onEvent((event) => {
      if (event.type === 'download-updated') return
      if (event.contextKey !== contextKey) return
      if (event.type === 'state-changed') {
        setState(event.state)
        setStateContextKey(contextKey)
        const tab = event.state.tabs.find((candidate) => candidate.id === event.state.activeTabId)
        if (!isEditingAddressRef.current) {
          setAddress(tab?.url ?? '')
          setAddressContextKey(contextKey)
        }
        return
      }
      if (event.commandId === BROWSER_COMMAND_IDS.focusAddress) focusAddressField()
      if (event.commandId === BROWSER_COMMAND_IDS.newTab) void createBlankTab()
      if (event.commandId === BROWSER_COMMAND_IDS.closeActiveTab) void closeActiveTab()
    })
  }, [closeActiveTab, contextKey, createBlankTab, focusAddressField, isEditingAddress])

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
          },
          shortcutBindings: getBrowserNativeShortcutBindings(shortcutManager)
        })
        .catch((reason: unknown) => setError(toErrorMessage(reason)))
    }

    syncBounds()
    const animationFrame = window.requestAnimationFrame(syncBounds)
    const observer = new ResizeObserver(syncBounds)
    observer.observe(surfaceElement)
    window.addEventListener('resize', syncBounds)
    return () => {
      window.cancelAnimationFrame(animationFrame)
      observer.disconnect()
      window.removeEventListener('resize', syncBounds)
      void window.spacezero.browser.hide({ contextKey, context })
    }
  }, [activeTabId, activeTabUrl, context, contextKey, shortcutBindingsVersion, shortcutManager])

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
      <div
        ref={tabStripRef}
        aria-label="Browser tabs"
        className="flex shrink-0 items-center gap-1 overflow-x-auto border-b px-2 py-1"
        role="tablist"
      >
        {contextState?.tabs.map((tab) => {
          const selected = tab.id === activeTabId
          return (
            <div
              key={tab.id}
              className={`flex min-w-32 max-w-56 shrink-0 items-center gap-1 rounded-md border px-1 py-1 text-sm ${
                selected ? 'bg-muted text-foreground' : 'bg-background text-muted-foreground'
              }`}
              draggable
              onDragOver={(event) => event.preventDefault()}
              onDragStart={(event) => {
                setDraggedTabId(tab.id)
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', tab.id)
              }}
              onDrop={(event) => {
                event.preventDefault()
                const sourceTabId = draggedTabId ?? event.dataTransfer.getData('text/plain')
                setDraggedTabId(null)
                void reorderTabs(sourceTabId, tab.id)
              }}
            >
              <button
                aria-selected={selected}
                className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-browser-tab-id={tab.id}
                role="tab"
                tabIndex={selected ? 0 : -1}
                type="button"
                onClick={() => void selectTab(tab.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    void selectTab(tab.id)
                    return
                  }
                  if (
                    event.key === 'ArrowLeft' ||
                    event.key === 'ArrowRight' ||
                    event.key === 'Home' ||
                    event.key === 'End'
                  ) {
                    event.preventDefault()
                    selectTabByKeyboard(tab.id, event.key)
                  }
                }}
              >
                {tab.faviconUrl ? (
                  <img
                    alt=""
                    className="size-4 shrink-0"
                    src={tab.faviconUrl}
                    onError={(event) => {
                      event.currentTarget.style.display = 'none'
                    }}
                    onLoad={(event) => {
                      event.currentTarget.style.display = ''
                    }}
                  />
                ) : null}
                <span className="truncate">{tabLabel(tab)}</span>
              </button>
              <Button
                aria-label={`Close ${tabLabel(tab)}`}
                className="h-6 px-2"
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => void closeTab(tab.id)}
              >
                ×
              </Button>
            </div>
          )
        })}
        <Button
          aria-label="New tab"
          size="sm"
          type="button"
          variant="outline"
          onClick={() => void createBlankTab()}
        >
          +
        </Button>
      </div>
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
          value={addressContextKey === contextKey ? address : ''}
          onChange={(event) => {
            isEditingAddressRef.current = true
            setIsEditingAddress(true)
            setAddress(event.target.value)
            setAddressContextKey(contextKey)
          }}
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
      {downloads.length > 0 ? (
        <div
          aria-label="Browser downloads"
          className="absolute bottom-3 right-3 flex max-w-md flex-col gap-2"
          role="status"
        >
          {downloads.map((download) => (
            <div key={download.id} className="rounded-md border bg-background p-3 text-sm shadow-lg">
              <div className="font-medium">{download.filename}</div>
              <div className="text-muted-foreground">{downloadStatusLabel(download)}</div>
              {download.status === 'completed' ? (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" type="button" onClick={() => void openDownload(download.id)}>
                    Open
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => void revealDownload(download.id)}
                  >
                    Reveal in folder
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function downloadStatusLabel(download: BrowserDownloadSnapshot): string {
  switch (download.status) {
    case 'selecting-save-location':
      return 'Choose where to save this download.'
    case 'downloading':
      return formatDownloadProgress(download)
    case 'completed':
      return 'Download complete.'
    case 'cancelled':
      return 'Download cancelled.'
    case 'failed':
      return 'Download failed.'
  }
}

function formatDownloadProgress(download: BrowserDownloadSnapshot): string {
  if (!download.totalBytes) return 'Downloading…'
  const percent = Math.min(100, Math.round((download.receivedBytes / download.totalBytes) * 100))
  return `Downloading… ${percent}%`
}

function tabLabel(tab: BrowserTab): string {
  if (tab.title?.trim()) return tab.title
  if (!tab.url) return 'New tab'
  try {
    const url = new URL(tab.url)
    return url.hostname || url.toString()
  } catch {
    return tab.url
  }
}

function toErrorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'Browser request failed.'
}
