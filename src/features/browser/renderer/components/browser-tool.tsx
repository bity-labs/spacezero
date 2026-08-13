import {
  ArrowClockwiseIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  PaperPlaneRightIcon,
  XIcon
} from '@phosphor-icons/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { useRegisterAppCommands } from '../../../app-commands/renderer/app-command-context'
import { isMacPlatform } from '../../../keyboard-shortcuts/renderer/keybinding-parser'
import {
  useKeyboardShortcutsManager,
  useRegisterKeyboardShortcuts
} from '../../../keyboard-shortcuts/renderer/keyboard-shortcut-provider'
import { Button } from '@renderer/components/ui/button'
import { useGlobalOverlayOpen } from '@renderer/hooks/use-global-overlay-open'

import {
  BROWSER_COMMAND_IDS,
  type BrowserContext,
  type BrowserDownloadSnapshot,
  type BrowserShortcutBinding,
  type BrowserState
} from '../../shared'
import {
  closeBrowserSidePaneTab,
  createBrowserSidePaneTab,
  focusOrCreateBrowserSidePaneTab,
  syncBrowserSidePaneState
} from '../../../side-pane/renderer/browser-side-pane'
import { useSidePaneStore } from '../../../side-pane/renderer/side-pane-store'

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
  const isGlobalOverlayOpen = useGlobalOverlayOpen()
  const [state, setState] = useState<BrowserState | null>(null)
  const [stateContextKey, setStateContextKey] = useState(contextKey)
  const [shortcutBindingsVersion, setShortcutBindingsVersion] = useState(0)
  const [address, setAddress] = useState('')
  const [addressContextKey, setAddressContextKey] = useState(contextKey)
  const [isEditingAddress, setIsEditingAddress] = useState(false)
  const isEditingAddressRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [downloadsVersion, setDownloadsVersion] = useState(0)
  const sidePaneTabId = useSidePaneStore((store) => {
    const layout = store.contexts[contextKey]
    const tab = layout?.tabs.find((candidate) => candidate.id === layout.activeTabId)
    return tab?.categoryId === 'browser' ? tab.id : null
  })
  const currentAddress = addressContextKey === contextKey ? address : ''
  const contextState = stateContextKey === contextKey ? state : null
  const activeTab = contextState?.tabs.find((tab) => tab.id === sidePaneTabId)
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

  const requestPresentation = useCallback((operation: () => Promise<unknown>): void => {
    void operation().catch((reason: unknown) => {
      setError(toErrorMessage(reason))
    })
  }, [])

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
      const nextState = await createBrowserSidePaneTab({ contextKey, context })
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

  const closeTab = useCallback(
    async (tabId: string): Promise<void> => {
      setError(null)
      try {
        const nextState = await closeBrowserSidePaneTab({ contextKey, context, tabId })
        setState(nextState)
        setStateContextKey(contextKey)
      } catch (reason) {
        setError(toErrorMessage(reason))
      }
    },
    [context, contextKey]
  )

  const closeActiveTab = useCallback(async (): Promise<void> => {
    if (!activeTabId) return
    await closeTab(activeTabId)
  }, [activeTabId, closeTab])

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
    void focusOrCreateBrowserSidePaneTab({ contextKey, context })
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
    }
  }, [context, contextKey, focusAddressField, shortcutManager])

  useEffect(() => {
    if (!contextState) return
    syncBrowserSidePaneState(contextKey, contextState)
  }, [contextKey, contextState])

  useEffect(() => {
    if (!activeTabId || !contextState || contextState.activeTabId === activeTabId) return
    void window.spacezero.browser
      .selectTab({ contextKey, context, tabId: activeTabId })
      .then((nextState) => {
        setState(nextState)
        setStateContextKey(contextKey)
      })
      .catch((reason: unknown) => setError(toErrorMessage(reason)))
  }, [activeTabId, context, contextKey, contextState])

  useEffect(() => {
    if (!isEditingAddressRef.current) {
      setAddress(activeTabUrl)
      setAddressContextKey(contextKey)
    }
  }, [activeTabUrl, contextKey, isEditingAddress])

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
        const priorTabIds = new Set(
          stateContextKey === contextKey ? (state?.tabs.map((tab) => tab.id) ?? []) : []
        )
        const activePageWasCreated = Boolean(
          event.state.activeTabId && !priorTabIds.has(event.state.activeTabId)
        )
        syncBrowserSidePaneState(contextKey, event.state, activePageWasCreated)
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
  }, [
    closeActiveTab,
    contextKey,
    createBlankTab,
    focusAddressField,
    isEditingAddress,
    state,
    stateContextKey
  ])

  useLayoutEffect(() => {
    const surface = surfaceRef.current
    if (!surface || !activeTabId) return
    if (isGlobalOverlayOpen) {
      shortcutManager.setContext({ browserFocused: false })
      requestPresentation(() => window.spacezero.browser.hide({ contextKey, context }))
      return
    }
    const surfaceElement = surface
    const shownTabId = activeTabId
    let cancelled = false

    function syncBounds(): void {
      if (cancelled) return
      const rect = surfaceElement.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return
      requestPresentation(() =>
        window.spacezero.browser.show({
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
      )
    }

    syncBounds()
    const animationFrame = window.requestAnimationFrame(syncBounds)
    const observer = new ResizeObserver(syncBounds)
    observer.observe(surfaceElement)
    window.addEventListener('resize', syncBounds)
    return () => {
      cancelled = true
      window.cancelAnimationFrame(animationFrame)
      observer.disconnect()
      window.removeEventListener('resize', syncBounds)
      requestPresentation(() => window.spacezero.browser.hide({ contextKey, context }))
    }
  }, [
    activeTabId,
    activeTabUrl,
    context,
    contextKey,
    isGlobalOverlayOpen,
    requestPresentation,
    shortcutBindingsVersion,
    shortcutManager
  ])

  async function submitNavigation(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!currentAddress.trim()) return
    await navigateToInput(currentAddress)
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
          size="icon-sm"
          title="Back"
          type="button"
          variant="ghost"
          onClick={() => void goBack()}
        >
          <ArrowLeftIcon aria-hidden="true" className="size-4" />
        </Button>
        <Button
          aria-label="Forward"
          disabled={!activeTab?.canGoForward}
          size="icon-sm"
          title="Forward"
          type="button"
          variant="ghost"
          onClick={() => void goForward()}
        >
          <ArrowRightIcon aria-hidden="true" className="size-4" />
        </Button>
        <Button
          aria-label={activeTab?.isLoading ? 'Stop loading' : 'Reload'}
          disabled={!activeTab?.url && !activeTab?.isLoading}
          size="icon-sm"
          title={activeTab?.isLoading ? 'Stop loading' : 'Reload'}
          type="button"
          variant="ghost"
          onClick={() => void reloadOrStop()}
        >
          {activeTab?.isLoading ? (
            <XIcon aria-hidden="true" className="size-4" />
          ) : (
            <ArrowClockwiseIcon aria-hidden="true" className="size-4" />
          )}
        </Button>
        <div className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            aria-label="Browser URL"
            className="h-8 w-full min-w-0 rounded-md border bg-background px-3 pr-10 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="Enter a URL or search terms"
            value={currentAddress}
            onChange={(event) => {
              isEditingAddressRef.current = true
              setIsEditingAddress(true)
              setAddress(event.target.value)
              setAddressContextKey(contextKey)
            }}
          />
          <Button
            aria-label="Go"
            className="absolute right-0 top-0"
            disabled={!currentAddress.trim()}
            size="icon-sm"
            title="Go"
            type="submit"
            variant="ghost"
          >
            <PaperPlaneRightIcon aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </form>
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
      <div ref={surfaceRef} aria-label="Browser page surface" className="min-h-0 flex-1" />
      {downloads.length > 0 ? (
        <div
          aria-label="Browser downloads"
          className="absolute bottom-3 right-3 flex max-w-md flex-col gap-2"
          role="status"
        >
          {downloads.map((download) => (
            <div
              key={download.id}
              className="rounded-md border bg-background p-3 text-sm shadow-lg"
            >
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

function toErrorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'Browser request failed.'
}
