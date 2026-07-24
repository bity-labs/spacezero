import { ipcMain } from 'electron'
import { rm } from 'node:fs/promises'
import { z } from 'zod'

import { IPC_CHANNELS } from '../../../shared/ipc'
import { createManagedProjectAgentSession } from '../../agent-workspace/main/agent-session-handler'
import { getDisabledGlobalSkillPaths } from '../../agent-workspace/main/agent-skill-settings.service'
import { resolveAgentSkillPaths } from '../../agent-workspace/main/agent-skill-paths'
import { createProjectSessionRequestSchema } from '../shared'
import { createSessionsRepository } from './sessions.repository'
import { getManagedWorktreeService } from './managed-worktree.runtime'
import { getAgentUtilityProcessHost } from '../../agent-workspace/main/agent-utility-process'
import { getTerminalService } from '../../terminal/main/terminal.runtime'
import { createSessionCleanupService } from './session-cleanup.service'
import { createSessionsService } from './sessions.service'

const sessionIdRequestSchema = z.object({ sessionId: z.string().trim().min(1) })

const sessionsRepository = createSessionsRepository()
const sessionsService = createSessionsService({ repository: sessionsRepository })
const sessionCleanupService = createSessionCleanupService({
  repository: sessionsRepository,
  worktrees: {
    remove: (request) => getManagedWorktreeService().remove(request)
  },
  deleteUtilitySession: (request) => getAgentUtilityProcessHost().deleteSession(request),
  removeTranscript: (path) => rm(path, { force: true }),
  closeTerminalsForSession: (session) => {
    if (session.managedContext === 'knowledge-base') return Promise.resolve()
    if (session.projectId) {
      return getTerminalService().closeAllForContext({
        kind: 'project-session',
        sessionId: session.id
      })
    }
    return getTerminalService().closeAllForContext({
      kind: 'workspace-session',
      sessionId: session.id
    })
  }
})

export function registerSessionsIpc(): void {
  ipcMain.handle(IPC_CHANNELS.sessions.listProjectSessions, () =>
    sessionsService.listProjectSessions()
  )
  ipcMain.handle(IPC_CHANNELS.sessions.listWorkspaceSessions, () =>
    sessionsService.listWorkspaceSessions()
  )
  ipcMain.handle(IPC_CHANNELS.sessions.createProjectSession, async (_event, input: unknown) => {
    const request = createProjectSessionRequestSchema.parse(input)
    const { session } = await createManagedProjectAgentSession(request, {
      repository: sessionsRepository,
      utilityHost: getAgentUtilityProcessHost(),
      worktrees: getManagedWorktreeService(),
      readDisabledGlobalSkillPaths: getDisabledGlobalSkillPaths,
      resolveSkillPaths: resolveAgentSkillPaths
    })
    return session
  })
  ipcMain.handle(IPC_CHANNELS.sessions.archive, async (_event, input: unknown) => {
    const { sessionId } = sessionIdRequestSchema.parse(input)
    await sessionsService.archiveSession(sessionId)
    await getAgentUtilityProcessHost()
      .deleteSession({ sessionId })
      .catch(() => undefined)
  })
  ipcMain.handle(IPC_CHANNELS.sessions.delete, async (_event, input: unknown) => {
    const { sessionId } = sessionIdRequestSchema.parse(input)
    await sessionCleanupService.deleteSession(sessionId)
  })
}
