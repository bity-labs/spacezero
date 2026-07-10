import { PencilSimple } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import type { Project } from '../../shared'
import { Button } from '@renderer/components/ui/button'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@renderer/components/ui/sidebar'
import { cn } from '@renderer/lib/utils'

type ProjectSidebarListProps = {
  projects: Project[]
  activeProject: Project | null
  status: 'loading' | 'ready' | 'error'
  error: string | null
  onAddProject: () => void
  onSelectProject: (project: Project) => void
  onEditProject: (project: Project) => void
}

export function ProjectSidebarList({
  projects,
  activeProject,
  status,
  error,
  onAddProject,
  onSelectProject,
  onEditProject
}: ProjectSidebarListProps): React.JSX.Element {
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
    <SidebarMenu className="px-2" aria-label={t('projects.list.label')}>
      {projects.map((project) => {
        const isActive = activeProject?.id === project.id
        return (
          <SidebarMenuItem key={project.id} className="group/project relative">
            <SidebarMenuButton
              type="button"
              isActive={isActive}
              className={cn(
                'w-full justify-start pr-8 text-muted-foreground',
                isActive ? 'text-foreground' : null
              )}
              onClick={() => onSelectProject(project)}
            >
              <span className="min-w-0 truncate">{project.name}</span>
            </SidebarMenuButton>
            <Button
              variant="ghost"
              size="icon-xs"
              className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground opacity-0 group-hover/project:opacity-100 focus-visible:opacity-100"
              aria-label={t('projects.edit.action', { name: project.name })}
              onClick={() => onEditProject(project)}
            >
              <PencilSimple className="h-3 w-3" aria-hidden="true" />
            </Button>
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )
}
