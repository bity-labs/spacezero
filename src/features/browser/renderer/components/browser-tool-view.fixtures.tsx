/* eslint-disable react-refresh/only-export-components -- visual fixture components are intentionally co-located with fixture props. */
import { Browser } from '@phosphor-icons/react'

import {
  SidePaneShellView,
  type SidePaneCategoryDescriptor,
  type SidePaneTab
} from '../../../side-pane/renderer'
import type { BrowserDownloadSnapshot, BrowserTab } from '../../shared'
import { BrowserToolView, type BrowserToolViewProps } from './browser-tool-view'

const noop = (): void => undefined

const faviconUrl =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"%3E%3Crect width="32" height="32" rx="8" fill="%2318181b"/%3E%3Cpath d="M8 16h16M16 8v16" stroke="white" stroke-width="3"/%3E%3C/svg%3E'

const browserCategory: SidePaneCategoryDescriptor = {
  id: 'browser',
  label: 'Browser',
  available: true,
  icon: Browser
}

function blankTab(overrides: Partial<BrowserTab> = {}): BrowserTab {
  return {
    id: 'browser-tab-1',
    url: null,
    title: null,
    faviconUrl: null,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    error: null,
    ...overrides
  }
}

function download(overrides: Partial<BrowserDownloadSnapshot>): BrowserDownloadSnapshot {
  return {
    id: 'download-1',
    tabId: 'browser-tab-1',
    filename: 'spacezero-browser-guide.pdf',
    status: 'downloading',
    receivedBytes: 42,
    totalBytes: 100,
    ...overrides
  }
}

function browserTabLabel(tab: BrowserTab | null): string {
  if (tab?.title?.trim()) return tab.title
  if (!tab?.url) return 'New tab'
  try {
    return new URL(tab.url).hostname || tab.url
  } catch {
    return tab.url
  }
}

export type BrowserToolSidePaneFixtureProps = BrowserToolViewProps

export function BrowserToolSidePaneFixture(
  props: BrowserToolSidePaneFixtureProps
): React.JSX.Element {
  const tab: SidePaneTab = {
    id: props.activeTab?.id ?? 'browser-tab-1',
    categoryId: 'browser',
    title: browserTabLabel(props.activeTab),
    faviconUrl: props.activeTab?.faviconUrl
  }

  return (
    <div className="flex h-full min-h-[620px] min-w-0">
      <SidePaneShellView
        activeContent={<BrowserToolView {...props} />}
        activeTabId={tab.id}
        canOpen
        categories={[browserCategory]}
        categoryMru={{ browser: tab.id }}
        contextKey="session:browser-story"
        isOpen
        maxWidth={900}
        minWidth={520}
        renderedWidth={720}
        tabs={[tab]}
        onActivateTab={noop}
        onCloseTab={noop}
        onCreateCategory={noop}
        onOpenCategory={noop}
        onReorderTab={noop}
      >
        <main
          aria-label="Project Session workspace"
          className="flex min-h-0 min-w-[240px] flex-1 items-center justify-center bg-muted/20 p-6 text-center text-xs text-muted-foreground"
        >
          Project Session
        </main>
      </SidePaneShellView>
    </div>
  )
}

function DocumentationPageFixture(): React.JSX.Element {
  return (
    <div className="h-full overflow-hidden bg-white text-zinc-950">
      <div className="border-b border-zinc-200 px-8 py-4 text-sm font-semibold">Space Zero</div>
      <div className="mx-auto max-w-xl px-8 py-16">
        <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Documentation</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Build without context switching.
        </h1>
        <p className="mt-4 text-sm leading-6 text-zinc-600">
          Keep projects, agent sessions, code, terminal output, and Browser previews together in one
          desktop workspace.
        </p>
      </div>
    </div>
  )
}

export const blankTabBrowserFixture = {
  activeTab: blankTab(),
  address: '',
  downloads: [],
  error: null,
  onAddressChange: noop,
  onBack: noop,
  onBrowserFocusChange: noop,
  onForward: noop,
  onNavigate: noop,
  onOpenDownload: noop,
  onReloadOrStop: noop,
  onRetry: noop,
  onRevealDownload: noop
} satisfies BrowserToolSidePaneFixtureProps

export const loadingUrlBrowserFixture = {
  ...blankTabBrowserFixture,
  activeTab: blankTab({
    url: 'https://spacezero.dev/docs',
    isLoading: true
  }),
  address: 'https://spacezero.dev/docs'
} satisfies BrowserToolSidePaneFixtureProps

export const loadedPageBrowserFixture = {
  ...blankTabBrowserFixture,
  activeTab: blankTab({
    url: 'https://spacezero.dev/docs',
    title: 'Space Zero Docs',
    faviconUrl,
    canGoBack: true
  }),
  address: 'https://spacezero.dev/docs',
  pageContent: <DocumentationPageFixture />
} satisfies BrowserToolSidePaneFixtureProps

export const failedLoadBrowserFixture = {
  ...blankTabBrowserFixture,
  activeTab: blankTab({
    url: 'https://preview.invalid/',
    title: 'preview.invalid',
    error: 'Couldn’t load this page. Check the address and try again.'
  }),
  address: 'https://preview.invalid/',
  error: 'Couldn’t load this page. Check the address and try again.'
} satisfies BrowserToolSidePaneFixtureProps

export const disabledHistoryBrowserFixture = {
  ...loadedPageBrowserFixture,
  activeTab: blankTab({
    url: 'https://spacezero.dev/docs',
    title: 'Space Zero Docs',
    faviconUrl,
    canGoBack: false,
    canGoForward: false
  })
} satisfies BrowserToolSidePaneFixtureProps

export const focusedAddressBrowserFixture = {
  ...loadedPageBrowserFixture,
  addressAutoFocus: true
} satisfies BrowserToolSidePaneFixtureProps

export const downloadInProgressBrowserFixture = {
  ...loadedPageBrowserFixture,
  downloads: [download({ status: 'downloading' })]
} satisfies BrowserToolSidePaneFixtureProps

export const downloadCompleteBrowserFixture = {
  ...loadedPageBrowserFixture,
  downloads: [download({ status: 'completed', receivedBytes: 100 })]
} satisfies BrowserToolSidePaneFixtureProps

export const downloadFailedBrowserFixture = {
  ...loadedPageBrowserFixture,
  downloads: [download({ status: 'failed', receivedBytes: 58 })]
} satisfies BrowserToolSidePaneFixtureProps
