import { Archive, CheckCircle, WarningCircle } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import { ThinkingOrb } from 'thinking-orbs'

import type { ProjectSession } from '../../../sessions/shared'
import { cn } from '@renderer/lib/utils'

import { ProjectItemActionButton } from './project-item-action-button'

export type ProjectSessionItemProps = {
  session: ProjectSession
  active: boolean
  onSelectSession?: (session: ProjectSession) => void
  onArchiveSession?: (session: ProjectSession) => void
}

export function ProjectSessionItem({
  session,
  active,
  onSelectSession,
  onArchiveSession
}: ProjectSessionItemProps): React.JSX.Element {
  const { t } = useTranslation()
  const statusIndicator = renderSessionStatusIndicator(
    session,
    t(`sessions.status.${session.status}`)
  )

  return (
    <div className="group/session relative">
      <button
        type="button"
        data-session-switch-target="true"
        className={cn(
          'flex h-8 w-full items-center gap-2 rounded-md px-2 pr-8 text-left text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : null
        )}
        onClick={() => onSelectSession?.(session)}
      >
        {statusIndicator}
        <span className="min-w-0 flex-1 truncate">{session.title}</span>
      </button>
      <div className="absolute right-1 top-1/2 flex -translate-y-1/2 gap-0.5 opacity-0 group-hover/session:opacity-100 focus-within:opacity-100">
        <ProjectItemActionButton
          label="Archive session"
          icon={Archive}
          onClick={() => onArchiveSession?.(session)}
        />
      </div>
    </div>
  )
}

function renderSessionStatusIndicator(
  session: ProjectSession,
  label: string
): React.JSX.Element | null {
  if (session.status === 'running') {
    return <ThinkingOrb state="solving" size={20} aria-label={label} />
  }

  if (session.status === 'completed') {
    return <CheckCircle className="h-5 w-5 shrink-0 text-green-500" aria-label={label} />
  }

  if (session.status === 'failed') {
    return <WarningCircle className="h-5 w-5 shrink-0 text-destructive" aria-label={label} />
  }

  return null
}
