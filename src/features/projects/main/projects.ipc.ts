import { ipcMain } from 'electron'
import { z } from 'zod'

import { IPC_CHANNELS } from '../../../shared/ipc'
import { getAgentUtilityProcessHost } from '../../agent-workspace/main/agent-utility-process'
import { getBrowserService } from '../../browser/main/browser.ipc'
import { getKnowledgeBaseProjectsService } from '../../knowledge-base/main'
import { getSessionCleanupService } from '../../sessions/main/session-cleanup.runtime'
import { createSessionsRepository } from '../../sessions/main/sessions.repository'
import { createSessionsService } from '../../sessions/main/sessions.service'
import { runWithLiveTerminalConfirmation } from '../../terminal/main/terminal-confirmation.service'
import { getTerminalService } from '../../terminal/main/terminal.runtime'
import {
  addProjectFromFolderRequestSchema,
  createEmptyProjectRequestSchema,
  updateProjectRequestSchema
} from '../shared'
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

export function registerProjectsIpc(): void {
  ipcMain.handle(IPC_CHANNELS.projects.list, () => projectsService.listProjects())
  ipcMain.handle(IPC_CHANNELS.projects.createEmpty, (_event, request: unknown) =>
    projectsService.createEmptyProject(createEmptyProjectRequestSchema.parse(request))
  )
  ipcMain.handle(IPC_CHANNELS.projects.addFromFolder, (_event, request: unknown) =>
    projectsService.addProjectFromFolder(addProjectFromFolderRequestSchema.parse(request))
  )
  ipcMain.handle(IPC_CHANNELS.projects.update, (_event, request: unknown) =>
    projectsService.updateProject(updateProjectRequestSchema.parse(request))
  )
  ipcMain.handle(IPC_CHANNELS.projects.archive, async (_event, input: unknown) => {
    const { projectId } = projectIdRequestSchema.parse(input)
    await archiveProjectLifecycle(projectId, {
      sessionsService,
      projectsService,
      deleteUtilitySession: (request) => getAgentUtilityProcessHost().deleteSession(request),
      closeBrowsersForSession: (session) => getBrowserService().closeSessionContext(session.id),
      closeProjectHomeTerminals: closeProjectHomeTerminalsForArchive,
      closeProjectHomeBrowser: (projectId) =>
        getBrowserService().closeContext({ kind: 'project-home', projectId })
    })
  })
  ipcMain.handle(IPC_CHANNELS.projects.delete, async (_event, input: unknown) => {
    const { projectId } = projectIdRequestSchema.parse(input)
    return deleteProjectLifecycle(projectId, {
      sessionCleanupService: getSessionCleanupService(),
      projectsService,
      destroyProjectHomeBrowser: (projectId) =>
        getBrowserService().destroyContext({ kind: 'project-home', projectId })
    })
  })
}

async function closeProjectHomeTerminalsForArchive(projectId: string): Promise<void> {
  const terminalService = getTerminalService()
  const context = { kind: 'project-home' as const, projectId }
  await runWithLiveTerminalConfirmation({
    operationKey: `archive-project:${projectId}`,
    purpose: 'archive-context',
    countLiveTerminals: () => terminalService.countLiveTerminalsForContext(context),
    run: () => terminalService.closeAllForContext(context)
  })
}
