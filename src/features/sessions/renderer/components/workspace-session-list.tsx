import { Archive, PencilSimple, Trash } from '@phosphor-icons/react'
import { useRef, useState, type FocusEvent } from 'react'
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
  onRenameSession?: (session: WorkspaceSession, title: string) => Promise<void>
  onArchiveSession?: (session: WorkspaceSession) => void
  onDeleteSession?: (session: WorkspaceSession) => void
}

export function WorkspaceSessionList({
  workspaceSessions,
  activeSessionId = null,
  status,
  error,
  onSelectSession,
  onRenameSession,
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
        <SidebarMenuItem key={session.id}>
          <WorkspaceSessionSidebarRow
            session={session}
            active={activeSessionId === session.id}
            onSelectSession={onSelectSession}
            onRenameSession={onRenameSession}
            onArchiveSession={onArchiveSession}
            onDeleteSession={onDeleteSession}
          />
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}

function WorkspaceSessionSidebarRow({
  session,
  active,
  onSelectSession,
  onRenameSession,
  onArchiveSession,
  onDeleteSession
}: {
  session: WorkspaceSession
  active: boolean
  onSelectSession: (session: WorkspaceSession) => void
  onRenameSession?: (session: WorkspaceSession, title: string) => Promise<void>
  onArchiveSession?: (session: WorkspaceSession) => void
  onDeleteSession?: (session: WorkspaceSession) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [isEditing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(session.title)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setSaving] = useState(false)

  function startEditing(): void {
    setDraftTitle(session.title)
    setError(null)
    setEditing(true)
    window.setTimeout(() => inputRef.current?.select(), 0)
  }

  function cancelEditing(): void {
    setDraftTitle(session.title)
    setError(null)
    setSaving(false)
    setEditing(false)
  }

  async function saveDraft(): Promise<void> {
    const nextTitle = draftTitle.trim()
    if (!nextTitle) {
      setError('Enter a Session title before saving.')
      setDraftTitle(session.title)
      return
    }
    if (nextTitle === session.title) {
      cancelEditing()
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onRenameSession?.(session, nextTitle)
      setEditing(false)
    } catch {
      setDraftTitle(session.title)
      setError('Unable to rename Session. Check the title and try again.')
    } finally {
      setSaving(false)
    }
  }

  function handleBlur(_event: FocusEvent<HTMLInputElement>): void {
    void saveDraft()
  }

  return (
    <div className="group/session relative">
      {isEditing ? (
        <div className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 pr-2 text-xs text-muted-foreground">
          <SessionStatusIndicator
            status={session.status === 'running' ? 'running' : 'idle'}
            label={t(`sessions.status.${session.status}`)}
          />
          <input
            ref={inputRef}
            aria-label="Rename workspace session"
            className="h-6 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            disabled={isSaving}
            value={draftTitle}
            onBlur={handleBlur}
            onChange={(event) => setDraftTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void saveDraft()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                cancelEditing()
              }
            }}
          />
          {error ? <span className="sr-only" role="alert">{error}</span> : null}
        </div>
      ) : (
        <>
          <button
            type="button"
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 pr-16 text-left text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : null
            )}
            onClick={() => onSelectSession(session)}
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
              aria-label="Rename workspace session"
              onClick={(event) => {
                event.stopPropagation()
                startEditing()
              }}
            >
              <PencilSimple className="h-3 w-3" aria-hidden="true" />
            </button>
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
        </>
      )}
    </div>
  )
}
