import {
  ArrowClockwiseIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  PaperPlaneRightIcon,
  XIcon
} from '@phosphor-icons/react'
import type { FocusEvent, FormEvent, ReactNode, RefObject } from 'react'

import { Button } from '@renderer/components/ui/button'

import type { BrowserDownloadSnapshot, BrowserTab } from '../../shared'

export type BrowserToolViewProps = {
  activeTab: BrowserTab | null
  address: string
  downloads: readonly BrowserDownloadSnapshot[]
  error: string | null
  addressAutoFocus?: boolean
  addressInputRef?: RefObject<HTMLInputElement | null>
  pageSurfaceRef?: RefObject<HTMLDivElement | null>
  rootRef?: RefObject<HTMLElement | null>
  pageContent?: ReactNode
  onAddressChange: (address: string) => void
  onBack: () => void
  onBrowserFocusChange: (focused: boolean) => void
  onForward: () => void
  onNavigate: () => void | Promise<void>
  onOpenDownload: (downloadId: string) => void
  onReloadOrStop: () => void
  onRetry: () => void
  onRevealDownload: (downloadId: string) => void
}

export function BrowserToolView({
  activeTab,
  address,
  downloads,
  error,
  addressAutoFocus = false,
  addressInputRef,
  pageSurfaceRef,
  rootRef,
  pageContent,
  onAddressChange,
  onBack,
  onBrowserFocusChange,
  onForward,
  onNavigate,
  onOpenDownload,
  onReloadOrStop,
  onRetry,
  onRevealDownload
}: BrowserToolViewProps): React.JSX.Element {
  const handleBlur = (event: FocusEvent<HTMLElement>): void => {
    if (!event.currentTarget.contains(event.relatedTarget)) onBrowserFocusChange(false)
  }
  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (!address.trim()) return
    void onNavigate()
  }

  return (
    <section
      ref={rootRef}
      aria-label="Browser"
      className="relative flex h-full min-h-0 flex-col bg-background"
      onFocusCapture={() => onBrowserFocusChange(true)}
      onBlurCapture={handleBlur}
    >
      <form className="flex shrink-0 items-center gap-2 border-b p-2" onSubmit={handleSubmit}>
        <Button
          aria-label="Back"
          disabled={!activeTab?.canGoBack}
          size="icon-sm"
          title="Back"
          type="button"
          variant="ghost"
          onClick={onBack}
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
          onClick={onForward}
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
          onClick={onReloadOrStop}
        >
          {activeTab?.isLoading ? (
            <XIcon aria-hidden="true" className="size-4" />
          ) : (
            <ArrowClockwiseIcon aria-hidden="true" className="size-4" />
          )}
        </Button>
        <div className="relative min-w-0 flex-1">
          <input
            ref={addressInputRef}
            aria-label="Browser URL"
            autoFocus={addressAutoFocus}
            className="h-8 w-full min-w-0 rounded-md border bg-background px-3 pr-10 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="Enter a URL or search terms"
            value={address}
            onChange={(event) => onAddressChange(event.target.value)}
          />
          <Button
            aria-label="Go"
            className="absolute right-0 top-0"
            disabled={!address.trim()}
            size="icon-sm"
            title="Go"
            type="submit"
            variant="ghost"
          >
            <PaperPlaneRightIcon aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </form>
      {error ? (
        <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2 text-sm text-destructive">
          <span>{error}</span>
          {activeTab?.url ? (
            <Button size="sm" type="button" variant="outline" onClick={onRetry}>
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}
      <div ref={pageSurfaceRef} aria-label="Browser page surface" className="min-h-0 flex-1">
        {pageContent}
      </div>
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
                  <Button size="sm" type="button" onClick={() => onOpenDownload(download.id)}>
                    Open
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => onRevealDownload(download.id)}
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
