import { BookOpenText } from '@phosphor-icons/react'

import type { KnowledgeBaseStatus } from '../shared'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'

export type KnowledgeBaseUnavailableScreenProps = {
  rootPath: string
  reason: Extract<KnowledgeBaseStatus, { setupState: 'unavailable' }>['reason']
  error: string | null
  isRecovering: boolean
  onReconnect: () => void
  onResetConfiguration: () => void
}

export function KnowledgeBaseUnavailableScreen({
  rootPath,
  reason,
  error,
  isRecovering,
  onReconnect,
  onResetConfiguration
}: KnowledgeBaseUnavailableScreenProps): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-8">
      <Card className="w-full max-w-xl gap-5 p-6">
        <div>
          <BookOpenText className="size-7 text-muted-foreground" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-semibold">Knowledge Base unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">{getUnavailableMessage(reason)}</p>
          <p className="mt-2 break-all text-xs text-muted-foreground">{rootPath}</p>
        </div>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Restore the repository at this path and reconnect, or reset the app configuration.
          Resetting does not delete files.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={isRecovering} onClick={onResetConfiguration}>
            Reset configuration
          </Button>
          <Button disabled={isRecovering} onClick={onReconnect}>
            {isRecovering ? 'Checking…' : 'Reconnect'}
          </Button>
        </div>
      </Card>
    </div>
  )
}

function getUnavailableMessage(reason: KnowledgeBaseUnavailableScreenProps['reason']): string {
  if (reason === 'missing') return 'The configured Knowledge Base repository could not be found.'
  if (reason === 'inaccessible') {
    return 'The configured Knowledge Base repository cannot be accessed.'
  }
  return 'The configured Knowledge Base path is no longer a Git repository.'
}
