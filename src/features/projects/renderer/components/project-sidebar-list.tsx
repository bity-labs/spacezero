import { Archive, CaretDown, CaretRight, Plus, PencilSimple, Trash } from '@phosphor-icons/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { Project } from '../../shared'
import type { ProjectSession } from '../../../sessions/shared'
import { SessionStatusIndicator } from '@renderer/components/ai-chat'
import { Button } from '@renderer/components/ui/button'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@renderer/components/ui/sidebar'
import { cn } from '@renderer/lib/utils'

type ProjectSidebarListProps = {
  projects: Project[]
  activeProject: Project | null
  status: 'loading' | 'ready' | 'error'
  error: string | null
  onAddProject: () => void
  sessionsByProjectId?: Map<string, ProjectSession[]>
  activeSessionId?: string | null
  sessionsStatus?: 'loading' | 'ready' | 'error'
  sessionsError?: string | null
  onSelectProject: (project: Project) => void
  onEditProject: (project: Project) => void
  onNewSession?: (project: Project) => void
  onSelectSession?: (session: ProjectSession) => void
  onArchiveSession?: (session: ProjectSession) => void
  onDeleteSession?: (session: ProjectSession) => void
}

export function ProjectSidebarList({
  projects,
  activeProject,
  status,
  error,
  onAddProject,
  onSelectProject,
  onEditProject,
  sessionsByProjectId = new Map(),
  activeSessionId = null,
  sessionsStatus = 'ready',
  sessionsError = null,
  onNewSession,
  onSelectSession,
  onArchiveSession,
  onDeleteSession
}: ProjectSidebarListProps): React.JSX.Element {
  const { t } = useTranslation()
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(new Set())

  function toggleProject(project: Project): void {
    setExpandedProjectIds((current) => {
      const next = new Set(current)
      if (next.has(project.id)) next.delete(project.id)
      else next.add(project.id)
      return next
    })
  }

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
      {projects.map((project) => {
        const isActive = activeProject?.id === project.id
        const isExpanded = expandedProjectIds.has(project.id)
        const projectSessions = sessionsByProjectId.get(project.id) ?? []
        return (
          <SidebarMenuItem key={project.id} className="group/project">
            <div className="relative">
              <button
                type="button"
                className="absolute left-1 top-1/2 z-10 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={isExpanded ? t('projects.list.collapse', { name: project.name }) : t('projects.list.expand', { name: project.name })}
                onClick={() => toggleProject(project)}
              >
                {isExpanded ? <CaretDown className="h-3 w-3" aria-hidden="true" /> : <CaretRight className="h-3 w-3" aria-hidden="true" />}
              </button>
              <SidebarMenuButton
                type="button"
                isActive={isActive}
                className={cn(
                  'w-full justify-start gap-1 pl-7 pr-8 text-muted-foreground',
                  isActive ? 'text-foreground' : null
                )}
                onClick={() => {
                  onSelectProject(project)
                  setExpandedProjectIds((current) => new Set([...current, project.id]))
                }}
              >
                <span className="min-w-0 truncate">{project.name}</span>
              </SidebarMenuButton>
              <Button
                variant="ghost"
                size="icon-xs"
                className="absolute right-1 top-1/2 z-10 -translate-y-1/2 text-muted-foreground opacity-0 group-hover/project:opacity-100 focus-visible:opacity-100"
                aria-label={t('projects.edit.action', { name: project.name })}
                onClick={() => onEditProject(project)}
              >
                <PencilSimple className="h-3 w-3" aria-hidden="true" />
              </Button>
            </div>

            {isExpanded ? (
              <div className="ml-3 mt-1 space-y-1 border-l border-sidebar-border pl-2">
                {sessionsStatus === 'loading' ? (
                  <p className="px-2 py-1 text-xs text-muted-foreground">{t('sessions.list.loading')}</p>
                ) : null}
                {sessionsStatus === 'error' ? (
                  <p className="px-2 py-1 text-xs text-destructive">
                    {sessionsError ?? t('sessions.list.error')}
                  </p>
                ) : null}
                {sessionsStatus === 'ready' && projectSessions.length === 0 ? (
                  <p className="px-2 py-1 text-xs text-muted-foreground">{t('sessions.list.empty')}</p>
                ) : null}
                {sessionsStatus === 'ready'
                  ? projectSessions.map((session) => (
                      <div key={session.id} className="group/session relative">
                        <button
                          type="button"
                          className={cn(
                            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 pr-12 text-left text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                            activeSessionId === session.id ? 'bg-sidebar-accent text-sidebar-accent-foreground' : null
                          )}
                          onClick={() => onSelectSession?.(session)}
                        >
                          <SessionStatusIndicator
                            status={session.status === 'running' ? 'running' : 'idle'}
                            label={t(`sessions.status.${session.status}`)}
                          />
                          <span className="min-w-0 flex-1 truncate">{session.title}</span>
                        </button>
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
                      </div>
                    ))
                  : null}
                <Button
                  variant="ghost"
                  size="xs"
                  className="w-full justify-start gap-2 text-xs text-muted-foreground"
                  onClick={() => onNewSession?.(project)}
                >
                  <Plus className="h-3 w-3" aria-hidden="true" />
                  {t('sessions.new')}
                </Button>
              </div>
            ) : null}
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )
}
