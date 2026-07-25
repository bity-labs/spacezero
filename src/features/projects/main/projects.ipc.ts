import { ipcMain } from 'electron'
import { rm } from 'node:fs/promises'
import { z } from 'zod'

import { IPC_CHANNELS } from '../../../shared/ipc'
import { getAgentUtilityProcessHost } from '../../agent-workspace/main/agent-utility-process'
import { getBrowserService } from '../../browser/main/browser.ipc'
import { getKnowledgeBaseProjectsService } from '../../knowledge-base/main'
import { createSessionsRepository } from '../../sessions/main/sessions.repository'
import { getManagedWorktreeService } from '../../sessions/main/managed-worktree.runtime'
import { createSessionCleanupService } from '../../sessions/main/session-cleanup.service'
import { createSessionsService } from '../../sessions/main/sessions.service'
import { shouldProceedWithLiveTerminalTermination } from '../../terminal/main/terminal-confirmation.service'
import { getTerminalService } from '../../terminal/main/terminal.runtime'
import { createEmptyProjectRequestSchema, updateProjectRequestSchema } from '../shared'
import { archiveProjectLifecycle, deleteProjectLifecycle } from './project-lifecycle-orchestration'
import { createProjectPathAdapter } from './project-path.adapter'
import { createProjectsRepository } from './projects.repository'
import { createProjectsService } from './projects.service'

const projectIdRequestSchema = z.object({ projectId: z.string().trim().min(1) })

const sessionsRepository = createSessionsRepository()
const projectsService = createProjectsService({
  repository: createProjectsRepository(),
  pathAdapter: createProjectPathAdapter(),
  linkKnowledgeBaseProject: (project) => getKnowledgeBaseProjectsService().linkProject(project),
  hasManagedSessions: (projectId) => sessionsRepository.hasManagedSessions(projectId)
})

const sessionsService = createSessionsService({ repository: sessionsRepository })
const sessionCleanupService = createSessionCleanupService({
  repository: sessionsRepository,
  worktrees: {
    remove: (request) => getManagedWorktreeService().remove(request)
  },
  deleteUtilitySession: (request) => getAgentUtilityProcessHost().deleteSession(request),
  removeTranscript: (path) => rm(path, { force: true }),
  closeTerminalsForSession: (session) =>
    getTerminalService().closeAllForContext({ kind: 'project-session', sessionId: session.id }),
  closeBrowsersForSession: (session) => getBrowserService().destroySessionContext(session.id)
})

export function registerProjectsIpc(): void {
  ipcMain.handle(IPC_CHANNELS.projects.list, () => projectsService.listProjects())
  ipcMain.handle(IPC_CHANNELS.projects.createEmpty, (_event, request: unknown) =>
    projectsService.createEmptyProject(createEmptyProjectRequestSchema.parse(request))
  )
  ipcMain.handle(IPC_CHANNELS.projects.addFromFolder, () => projectsService.addProjectFromFolder())
  ipcMain.handle(IPC_CHANNELS.projects.update, (_event, request: unknown) =>
    projectsService.updateProject(updateProjectRequestSchema.parse(request))
  )
  ipcMain.handle(IPC_CHANNELS.projects.archive, async (_event, input: unknown) => {
    const { projectId } = projectIdRequestSchema.parse(input)
    await archiveProjectLifecycle(projectId, {
      sessionsService,
      projectsService,
      deleteUtilitySession: (request) => getAgentUtilityProcessHost().deleteSession(request),
      closeBrowsersForSession: (session) => getBrowserService().destroySessionContext(session.id)
    })
  })
  ipcMain.handle(IPC_CHANNELS.projects.delete, async (_event, input: unknown) => {
    const { projectId } = projectIdRequestSchema.parse(input)
    const sessions = await sessionsRepository.listByProjectIdIncludingArchived(projectId)
    const terminalService = getTerminalService()
    const liveCount = sessions.reduce(
      (count, session) =>
        count +
        (terminalService.countLiveTerminalsForContext({
          kind: 'project-session',
          sessionId: session.id
        }) ?? 0),
      0
    )
    const confirmed = await shouldProceedWithLiveTerminalTermination({
      count: liveCount,
      purpose: 'delete-context'
    })
    if (!confirmed) throw new Error('terminal.confirmationCancelled')
    await deleteProjectLifecycle(projectId, { sessionCleanupService, projectsService })
  })
}
