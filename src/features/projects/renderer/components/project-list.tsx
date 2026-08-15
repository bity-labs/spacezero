import { useTranslation } from 'react-i18next'

import type { Project } from '../../shared'
import type { ProjectSession } from '../../../sessions/shared'
import { Button } from '@renderer/components/ui/button'
import { SidebarMenu } from '@renderer/components/ui/sidebar'

import { ProjectItem } from './project-item'

export type ProjectListProps = {
  projects: Project[]
  activeProject: Project | null
  status: 'loading' | 'ready' | 'error'
  error: string | null
  expandedProjectIds: ReadonlySet<string>
  sessionsByProjectId?: Map<string, ProjectSession[]>
  activeSessionId?: string | null
  sessionsStatus?: 'loading' | 'ready' | 'error'
  sessionsError?: string | null
  onAddProject: () => void
  onToggleProject: (project: Project) => void
  onSelectProject: (project: Project) => void
  onEditProject: (project: Project) => void
  onArchiveProject?: (project: Project) => void
  onDeleteProject?: (project: Project) => void
  onNewSession?: (project: Project) => void
  onSelectSession?: (session: ProjectSession) => void
  onRenameSession?: (session: ProjectSession, title: string) => Promise<void>
  onArchiveSession?: (session: ProjectSession) => void
  onDeleteSession?: (session: ProjectSession) => void
}

export function ProjectList({
  projects,
  activeProject,
  status,
  error,
  expandedProjectIds,
  sessionsByProjectId = new Map(),
  activeSessionId = null,
  sessionsStatus = 'ready',
  sessionsError = null,
  onAddProject,
  onToggleProject,
  onSelectProject,
  onEditProject,
  onArchiveProject,
  onNewSession,
  onSelectSession,
  onRenameSession,
  onArchiveSession,
  onDeleteSession
}: ProjectListProps): React.JSX.Element {
  const { t } = useTranslation()

  if (status === 'loading') {
    return <p className="px-4 py-2 text-xs text-muted-foreground">{t('projects.list.loading')}</p>
  }

  if (status === 'error') {
    return <p className="px-4 py-2 text-xs text-destructive">{error ?? t('projects.list.error')}</p>
  }

  if (projects.length === 0) {
    return (
      <div className="mx-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <p>{t('projects.list.empty')}</p>
        <Button className="mt-3 w-full" size="xs" variant="outline" onClick={onAddProject}>
          {t('projects.list.addFirst')}
        </Button>
      </div>
    )
  }

  return (
    <SidebarMenu className="mt-2 px-2" aria-label={t('projects.list.label')}>
      {projects.map((project) => (
        <ProjectItem
          key={project.id}
          project={project}
          active={activeProject?.id === project.id}
          expanded={expandedProjectIds.has(project.id)}
          sessions={sessionsByProjectId.get(project.id) ?? []}
          activeSessionId={activeSessionId}
          sessionsStatus={sessionsStatus}
          sessionsError={sessionsError}
          onToggleProject={onToggleProject}
          onSelectProject={onSelectProject}
          onEditProject={onEditProject}
          onArchiveProject={onArchiveProject}
          onNewSession={onNewSession}
          onSelectSession={onSelectSession}
          onRenameSession={onRenameSession}
          onArchiveSession={onArchiveSession}
          onDeleteSession={onDeleteSession}
        />
      ))}
    </SidebarMenu>
  )
}
