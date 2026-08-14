import { Button } from '@renderer/components/ui/button'

export type TerminalToolViewStatus =
  'starting' | 'ready' | 'running' | 'empty' | 'failed' | 'unavailable'

export type TerminalToolOutputLine =
  { kind: 'command' | 'output'; content: string } | { kind: 'link'; content: string; url: string }

export type TerminalToolViewProps = {
  status: TerminalToolViewStatus
  error: string | null
  diagnostics: readonly string[]
  output?: readonly TerminalToolOutputLine[]
  browserFallbackUrl?: string | null
  terminalContainerRef?: React.RefObject<HTMLDivElement | null>
  onCancelBrowserFallback: () => void
  onCopyBrowserFallback: () => void
  onNewTerminal: () => void
  onOpenBrowserFallback: () => void
  onOpenLink: (url: string) => void
  onRetry: () => void
}

export function TerminalToolView({
  status,
  error,
  diagnostics,
  output = [],
  browserFallbackUrl,
  terminalContainerRef,
  onCancelBrowserFallback,
  onCopyBrowserFallback,
  onNewTerminal,
  onOpenBrowserFallback,
  onOpenLink,
  onRetry
}: TerminalToolViewProps): React.JSX.Element {
  return (
    <>
      <section aria-label="Terminal" className="flex h-full min-h-0 flex-col bg-background">
        {status === 'failed' || status === 'unavailable' ? (
          <TerminalFailureView
            error={error}
            status={status}
            onRetry={status === 'failed' ? onRetry : undefined}
          />
        ) : status === 'empty' ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
            <p className="text-sm text-muted-foreground">New Terminal</p>
            <Button size="sm" onClick={onNewTerminal}>
              New Terminal
            </Button>
          </div>
        ) : (
          <div className="relative min-h-0 flex-1 overflow-hidden bg-[#0f1115] p-2 text-[#d6d9df]">
            <div
              ref={terminalContainerRef}
              aria-label="Terminal output"
              className="h-full overflow-auto rounded-sm font-mono text-[13px] leading-5"
            >
              {output.length > 0 ? (
                <div className="whitespace-pre-wrap p-2">
                  {output.map((line, index) => (
                    <TerminalOutputLineView
                      key={`${line.kind}:${index}:${line.content}`}
                      line={line}
                      onOpenLink={onOpenLink}
                    />
                  ))}
                </div>
              ) : null}
            </div>
            {diagnostics.length > 0 ? (
              <div
                role="status"
                className="absolute inset-x-4 top-4 rounded-md border bg-background/95 p-2 font-sans text-xs text-muted-foreground shadow-sm"
              >
                {diagnostics.map((diagnostic) => (
                  <p key={diagnostic}>{diagnostic}</p>
                ))}
              </div>
            ) : null}
            {status === 'starting' ? (
              <div className="pointer-events-none absolute inset-12 font-sans text-xs text-muted-foreground">
                Starting terminal…
              </div>
            ) : null}
            {status === 'ready' ? (
              <span aria-label="Terminal ready" className="sr-only" role="status" />
            ) : null}
            {status === 'running' ? (
              <div className="absolute right-4 top-4 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 font-sans text-[11px] text-emerald-300">
                Running
              </div>
            ) : null}
          </div>
        )}
      </section>
      {browserFallbackUrl ? (
        <div
          aria-label="Terminal Link choices"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/60"
          role="dialog"
        >
          <div className="max-w-md rounded-lg border bg-background p-4 shadow-lg">
            <p className="text-sm font-medium">Browser is unavailable</p>
            <p className="mt-2 break-all text-xs text-muted-foreground">{browserFallbackUrl}</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={onCancelBrowserFallback}>
                Cancel
              </Button>
              <Button size="sm" variant="outline" onClick={onCopyBrowserFallback}>
                Copy URL
              </Button>
              <Button size="sm" onClick={onOpenBrowserFallback}>
                Open in default browser
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

function TerminalFailureView({
  error,
  status,
  onRetry
}: {
  error: string | null
  status: 'failed' | 'unavailable'
  onRetry?: () => void
}): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
      <div>
        <p className="text-sm font-medium">
          {status === 'failed' ? 'Terminal failed to start' : 'Terminal unavailable'}
        </p>
        {error ? <p className="mt-1 max-w-md text-xs text-muted-foreground">{error}</p> : null}
      </div>
      {onRetry ? (
        <Button size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  )
}

function TerminalOutputLineView({
  line,
  onOpenLink
}: {
  line: TerminalToolOutputLine
  onOpenLink: (url: string) => void
}): React.JSX.Element {
  if (line.kind === 'link') {
    return (
      <div>
        <button
          aria-label={`Open ${line.url} in Browser`}
          className="cursor-pointer text-sky-400 underline decoration-sky-400/60 underline-offset-2 hover:text-sky-300"
          type="button"
          onClick={(event) => {
            if (event.detail === 0 || event.metaKey || event.ctrlKey) {
              onOpenLink(line.url)
            }
          }}
        >
          {line.content}
        </button>
        <span className="ml-2 text-[11px] text-[#89909d]">mod+click</span>
      </div>
    )
  }

  return (
    <div className={line.kind === 'command' ? 'text-[#f4f5f7]' : 'text-[#aeb4bf]'}>
      {line.kind === 'command' ? '$ ' : ''}
      {line.content}
    </div>
  )
}
