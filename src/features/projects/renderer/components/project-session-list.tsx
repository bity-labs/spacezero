import { Plus } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import type { Project } from '../../shared'
import type { ProjectSession } from '../../../sessions/shared'
import { Button } from '@renderer/components/ui/button'

import { ProjectSessionItem } from './project-session-item'

export type ProjectSessionListProps = {
  project: Project
  sessions: ProjectSession[]
  activeSessionId?: string | null
  status?: 'loading' | 'ready' | 'error'
  error?: string | null
  onNewSession?: (project: Project) => void
  onSelectSession?: (session: ProjectSession) => void
  onRenameSession?: (session: ProjectSession, title: string) => Promise<void>
  onArchiveSession?: (session: ProjectSession) => void
  onDeleteSession?: (session: ProjectSession) => void
}

export function ProjectSessionList({
  project,
  sessions,
  activeSessionId = null,
  status = 'ready',
  error = null,
  onNewSession,
  onSelectSession,
  onArchiveSession
}: ProjectSessionListProps): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <div className="ml-3 mt-1 space-y-1 border-l border-sidebar-border pl-2">
      {status === 'loading' ? (
        <p className="flex h-8 items-center px-2 text-sm text-muted-foreground">
          {t('sessions.list.loading')}
        </p>
      ) : null}
      {status === 'error' ? (
        <p className="flex h-8 items-center px-2 text-sm text-destructive">
          {error ?? t('sessions.list.error')}
        </p>
      ) : null}
      {status === 'ready' && sessions.length === 0 ? (
        <p className="flex h-8 items-center px-2 text-sm text-muted-foreground">
          {t('sessions.list.empty')}
        </p>
      ) : null}
      {status === 'ready'
        ? sessions.map((session) => (
            <ProjectSessionItem
              key={session.id}
              session={session}
              active={activeSessionId === session.id}
              onSelectSession={onSelectSession}
              onArchiveSession={onArchiveSession}
            />
          ))
        : null}
      <Button
        variant="ghost"
        className="h-8 w-full justify-start gap-2 px-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        onClick={() => onNewSession?.(project)}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {t('sessions.new')}
      </Button>
    </div>
  )
}
