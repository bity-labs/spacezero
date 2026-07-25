import { ipcMain } from 'electron'
import { z } from 'zod'

import { IPC_CHANNELS } from '../../../shared/ipc'
import { createManagedProjectAgentSession } from '../../agent-workspace/main/agent-session-handler'
import { getBrowserService } from '../../browser/main/browser.ipc'
import { getDisabledGlobalSkillPaths } from '../../agent-workspace/main/agent-skill-settings.service'
import { resolveAgentSkillPaths } from '../../agent-workspace/main/agent-skill-paths'
import { createProjectSessionRequestSchema } from '../shared'
import { createSessionsRepository } from './sessions.repository'
import { getManagedWorktreeService } from './managed-worktree.runtime'
import { getAgentUtilityProcessHost } from '../../agent-workspace/main/agent-utility-process'
import { getSessionCleanupService } from './session-cleanup.runtime'
import { createSessionsService } from './sessions.service'

const sessionIdRequestSchema = z.object({ sessionId: z.string().trim().min(1) })

const sessionsRepository = createSessionsRepository()
const sessionsService = createSessionsService({ repository: sessionsRepository })

function closeBrowserContextForSession(session: { id: string; projectId: string | null; managedContext?: 'knowledge-base' | null }): void {
  if (session.managedContext === 'knowledge-base') {
    getBrowserService().destroyKnowledgeBaseContext()
    return
  }
  getBrowserService().destroySessionContext(session.id)
}

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
    const session = await sessionsRepository.findSessionById(sessionId)
    await sessionsService.archiveSession(sessionId)
    if (session) closeBrowserContextForSession(session)
    await getAgentUtilityProcessHost()
      .deleteSession({ sessionId })
      .catch(() => undefined)
  })
  ipcMain.handle(IPC_CHANNELS.sessions.delete, async (_event, input: unknown) => {
    const { sessionId } = sessionIdRequestSchema.parse(input)
    await getSessionCleanupService().deleteSession(sessionId)
  })
}
