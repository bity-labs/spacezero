import { Archive, Trash } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import type { WorkspaceSession } from '../../shared'
import { SessionStatusIndicator } from '@renderer/components/ai-chat'
import { SidebarMenu, SidebarMenuItem } from '@renderer/components/ui/sidebar'
import { cn } from '@renderer/lib/utils'

type WorkspaceSessionListProps = {
  workspaceSessions: WorkspaceSession[]
  activeSessionId?: string | null
  status: 'loading' | 'ready' | 'error'
  error: string | null
  onSelectSession: (session: WorkspaceSession) => void
  onArchiveSession?: (session: WorkspaceSession) => void
  onDeleteSession?: (session: WorkspaceSession) => void
}

export function WorkspaceSessionList({
  workspaceSessions,
  activeSessionId = null,
  status,
  error,
  onSelectSession,
  onArchiveSession,
  onDeleteSession
}: WorkspaceSessionListProps): React.JSX.Element {
  const { t } = useTranslation()

  if (status === 'loading') {
    return (
      <p className="px-4 py-2 text-xs text-muted-foreground">
        {t('sessions.workspaceList.loading')}
      </p>
    )
  }

  if (status === 'error') {
    return (
      <p className="px-4 py-2 text-xs text-destructive">
        {error ?? t('sessions.workspaceList.error')}
      </p>
    )
  }

  if (workspaceSessions.length === 0) {
    return (
      <p className="px-4 py-2 text-xs text-muted-foreground">
        {t('sessions.workspaceList.empty')}
      </p>
    )
  }

  return (
    <SidebarMenu className="mt-2 px-2" aria-label={t('sessions.workspaceList.label')}>
      {workspaceSessions.map((session) => (
        <SidebarMenuItem key={session.id} className="group/session">
          <div className="relative">
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 pr-12 text-left text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                activeSessionId === session.id
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : null
              )}
              onClick={() => onSelectSession(session)}
            >
              <SessionStatusIndicator
                status={session.status === 'running' ? 'running' : 'idle'}
                label={t(`sessions.status.${session.status}`)}
              />
              <span className="min-w-0 flex-1 truncate">{session.title}</span>
            </button>
            <SessionActions session={session} onArchiveSession={onArchiveSession} onDeleteSession={onDeleteSession} />
          </div>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}

function SessionActions({
  session,
  onArchiveSession,
  onDeleteSession
}: {
  session: WorkspaceSession
  onArchiveSession?: (session: WorkspaceSession) => void
  onDeleteSession?: (session: WorkspaceSession) => void
}): React.JSX.Element {
  return (
    <div className="absolute right-1 top-1/2 flex -translate-y-1/2 gap-0.5 opacity-0 group-hover/session:opacity-100 focus-within:opacity-100">
      <button
        type="button"
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Archive session"
        onClick={(event) => {
          event.stopPropagation()
          onArchiveSession?.(session)
        }}
      >
        <Archive className="h-3 w-3" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        aria-label="Delete session"
        onClick={(event) => {
          event.stopPropagation()
          onDeleteSession?.(session)
        }}
      >
        <Trash className="h-3 w-3" aria-hidden="true" />
      </button>
    </div>
  )
}
