import { useCallback, useEffect, useMemo, useState } from 'react'

import type { CreateProjectSessionRequest, ProjectSession } from '../../shared'

type ProjectSessionsStatus = 'loading' | 'ready' | 'error'

export function useProjectSessions(): {
  sessions: ProjectSession[]
  sessionsByProjectId: Map<string, ProjectSession[]>
  status: ProjectSessionsStatus
  error: string | null
  refreshSessions: () => Promise<void>
  createProjectSession: (request: CreateProjectSessionRequest) => Promise<ProjectSession>
  upsertProjectSession: (session: ProjectSession) => void
  archiveSession: (sessionId: string) => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
} {
  const [sessions, setSessions] = useState<ProjectSession[]>([])
  const [status, setStatus] = useState<ProjectSessionsStatus>('loading')
  const [error, setError] = useState<string | null>(null)

  const refreshSessions = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const nextSessions = await window.spacezero.sessions.listProjectSessions()
      setSessions(nextSessions)
      setStatus('ready')
    } catch {
      setError('Unable to load sessions.')
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    let canceled = false

    async function loadSessions(): Promise<void> {
      try {
        const nextSessions = await window.spacezero.sessions.listProjectSessions()
        if (canceled) return
        setSessions(nextSessions)
        setStatus('ready')
      } catch {
        if (canceled) return
        setError('Unable to load sessions.')
        setStatus('error')
      }
    }

    void loadSessions()

    return () => {
      canceled = true
    }
  }, [])

  const createProjectSession = useCallback(async (request: CreateProjectSessionRequest) => {
    const session = await window.spacezero.sessions.createProjectSession(request)
    setSessions((currentSessions) => {
      const withoutDuplicate = currentSessions.filter((existing) => existing.id !== session.id)
      return [...withoutDuplicate, session]
    })
    return session
  }, [])

  const upsertProjectSession = useCallback((session: ProjectSession) => {
    setSessions((currentSessions) => {
      const withoutDuplicate = currentSessions.filter((existing) => existing.id !== session.id)
      return [...withoutDuplicate, session]
    })
  }, [])

  const archiveSession = useCallback(async (sessionId: string) => {
    await window.spacezero.sessions.archive({ sessionId })
    setSessions((currentSessions) => currentSessions.filter((session) => session.id !== sessionId))
  }, [])

  const deleteSession = useCallback(async (sessionId: string) => {
    await window.spacezero.sessions.delete({ sessionId })
    setSessions((currentSessions) => currentSessions.filter((session) => session.id !== sessionId))
  }, [])

  const sessionsByProjectId = useMemo(() => {
    const grouped = new Map<string, ProjectSession[]>()
    for (const session of sessions) {
      grouped.set(session.projectId, [...(grouped.get(session.projectId) ?? []), session])
    }
    return grouped
  }, [sessions])

  return { sessions, sessionsByProjectId, status, error, refreshSessions, createProjectSession, upsertProjectSession, archiveSession, deleteSession }
}
