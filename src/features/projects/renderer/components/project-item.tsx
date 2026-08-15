import { Archive, CaretDown, CaretRight, PencilSimple } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import type { Project } from '../../shared'
import type { ProjectSession } from '../../../sessions/shared'
import { SidebarMenuButton, SidebarMenuItem } from '@renderer/components/ui/sidebar'
import { cn } from '@renderer/lib/utils'

import { ProjectItemActionButton } from './project-item-action-button'
import { ProjectSessionList } from './project-session-list'

export type ProjectItemProps = {
  project: Project
  active: boolean
  expanded: boolean
  sessions: ProjectSession[]
  activeSessionId?: string | null
  sessionsStatus?: 'loading' | 'ready' | 'error'
  sessionsError?: string | null
  onToggleProject: (project: Project) => void
  onSelectProject: (project: Project) => void
  onEditProject: (project: Project) => void
  onArchiveProject?: (project: Project) => void
  onNewSession?: (project: Project) => void
  onSelectSession?: (session: ProjectSession) => void
  onRenameSession?: (session: ProjectSession, title: string) => Promise<void>
  onArchiveSession?: (session: ProjectSession) => void
  onDeleteSession?: (session: ProjectSession) => void
}

export function ProjectItem({
  project,
  active,
  expanded,
  sessions,
  activeSessionId = null,
  sessionsStatus = 'ready',
  sessionsError = null,
  onToggleProject,
  onSelectProject,
  onEditProject,
  onArchiveProject,
  onNewSession,
  onSelectSession,
  onRenameSession,
  onArchiveSession,
  onDeleteSession
}: ProjectItemProps): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <SidebarMenuItem className="group/project">
      <div className="relative">
        <button
          type="button"
          className="absolute left-1 top-1/2 z-10 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label={
            expanded
              ? t('projects.list.collapse', { name: project.name })
              : t('projects.list.expand', { name: project.name })
          }
          onClick={() => onToggleProject(project)}
        >
          {expanded ? (
            <CaretDown className="h-4 w-4" aria-hidden="true" />
          ) : (
            <CaretRight className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
        <SidebarMenuButton
          type="button"
          isActive={active}
          className={cn(
            'w-full justify-start gap-1 pl-7 pr-20 text-muted-foreground',
            active ? 'text-foreground' : null
          )}
          onClick={() => onSelectProject(project)}
        >
          <span className="min-w-0 truncate">{project.name}</span>
        </SidebarMenuButton>
        <div className="absolute right-1 top-1/2 z-10 flex -translate-y-1/2 gap-0.5 opacity-0 group-hover/project:opacity-100 focus-within:opacity-100">
          <ProjectItemActionButton
            label={t('projects.edit.action', { name: project.name })}
            icon={PencilSimple}
            onClick={() => onEditProject(project)}
          />
          <ProjectItemActionButton
            label="Archive project"
            icon={Archive}
            onClick={() => onArchiveProject?.(project)}
          />
        </div>
      </div>

      {expanded ? (
        <ProjectSessionList
          project={project}
          sessions={sessions}
          activeSessionId={activeSessionId}
          status={sessionsStatus}
          error={sessionsError}
          onNewSession={onNewSession}
          onSelectSession={onSelectSession}
          onRenameSession={onRenameSession}
          onArchiveSession={onArchiveSession}
          onDeleteSession={onDeleteSession}
        />
      ) : null}
    </SidebarMenuItem>
  )
}
