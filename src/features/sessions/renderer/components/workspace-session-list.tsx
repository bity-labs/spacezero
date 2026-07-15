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
}

export function WorkspaceSessionList({
  workspaceSessions,
  activeSessionId = null,
  status,
  error,
  onSelectSession
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
        <SidebarMenuItem key={session.id}>
          <button
            type="button"
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
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
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}
