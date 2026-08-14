import type { ReactNode } from 'react'

import { Alert, AlertDescription } from '@renderer/components/ui/alert'

export type KnowledgeBaseConfiguredScreenProps = {
  setupWarning?: string
  error?: string | null
  isClearingChat?: boolean
  children: ReactNode
}

export function KnowledgeBaseConfiguredScreen({
  setupWarning,
  error,
  isClearingChat = false,
  children
}: KnowledgeBaseConfiguredScreenProps): React.JSX.Element {
  return (
    <section
      aria-label="Configured Knowledge Base"
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
    >
      {setupWarning ? (
        <Alert className="m-4 mb-0">
          <AlertDescription>{setupWarning}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert className="m-4 mb-0" variant="destructive">
          <AlertDescription>{error} Your previous chat is still current.</AlertDescription>
        </Alert>
      ) : null}
      {isClearingChat ? (
        <div className="px-4 pt-3 text-sm text-muted-foreground" role="status">
          Starting a fresh Knowledge Base Chat…
        </div>
      ) : null}
      {children}
    </section>
  )
}
