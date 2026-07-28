import { useCallback, useEffect, useState } from 'react'

import type { WorkspaceSession } from '../../shared'

type WorkspaceSessionsStatus = 'loading' | 'ready' | 'error'

export function useWorkspaceSessions(): {
  workspaceSessions: WorkspaceSession[]
  status: WorkspaceSessionsStatus
  error: string | null
  refreshWorkspaceSessions: () => Promise<void>
  upsertWorkspaceSession: (session: WorkspaceSession) => void
  renameWorkspaceSession: (sessionId: string, title: string) => Promise<WorkspaceSession>
  archiveWorkspaceSession: (sessionId: string) => Promise<void>
  deleteWorkspaceSession: (sessionId: string) => Promise<void>
} {
  const [workspaceSessions, setWorkspaceSessions] = useState<WorkspaceSession[]>([])
  const [status, setStatus] = useState<WorkspaceSessionsStatus>('loading')
  const [error, setError] = useState<string | null>(null)

  const refreshWorkspaceSessions = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const nextSessions = await window.spacezero.sessions.listWorkspaceSessions()
      setWorkspaceSessions(nextSessions)
      setStatus('ready')
    } catch {
      setError('Unable to load workspace sessions.')
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    let canceled = false

    async function loadWorkspaceSessions(): Promise<void> {
      try {
        const nextSessions = await window.spacezero.sessions.listWorkspaceSessions()
        if (canceled) return
        setWorkspaceSessions(nextSessions)
        setStatus('ready')
      } catch {
        if (canceled) return
        setError('Unable to load workspace sessions.')
        setStatus('error')
      }
    }

    void loadWorkspaceSessions()

    return () => {
      canceled = true
    }
  }, [])

  const upsertWorkspaceSession = useCallback((session: WorkspaceSession) => {
    setError(null)
    setStatus('ready')
    setWorkspaceSessions((currentSessions) => {
      const withoutDuplicate = currentSessions.filter((existing) => existing.id !== session.id)
      return [...withoutDuplicate, session]
    })
  }, [])

  const renameWorkspaceSession = useCallback(async (sessionId: string, title: string) => {
    const renamedSession = await window.spacezero.sessions.rename({ sessionId, title })
    if (renamedSession.kind !== 'workspace') {
      throw new Error('Renamed Session was not a Workspace Session')
    }
    setWorkspaceSessions((currentSessions) =>
      currentSessions.map((session) => (session.id === sessionId ? renamedSession : session))
    )
    return renamedSession
  }, [])

  const archiveWorkspaceSession = useCallback(async (sessionId: string) => {
    await window.spacezero.sessions.archive({ sessionId })
    setWorkspaceSessions((currentSessions) => currentSessions.filter((session) => session.id !== sessionId))
  }, [])

  const deleteWorkspaceSession = useCallback(async (sessionId: string) => {
    await window.spacezero.sessions.delete({ sessionId })
    setWorkspaceSessions((currentSessions) => currentSessions.filter((session) => session.id !== sessionId))
  }, [])

  return {
    workspaceSessions,
    status,
    error,
    refreshWorkspaceSessions,
    upsertWorkspaceSession,
    renameWorkspaceSession,
    archiveWorkspaceSession,
    deleteWorkspaceSession
  }
}
