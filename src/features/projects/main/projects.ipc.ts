import { ipcMain } from 'electron'
import { rm } from 'node:fs/promises'
import { z } from 'zod'

import { IPC_CHANNELS } from '../../../shared/ipc'
import { getAgentUtilityProcessHost } from '../../agent-workspace/main/agent-utility-process'
import { createSessionsRepository } from '../../sessions/main/sessions.repository'
import { createSessionsService } from '../../sessions/main/sessions.service'
import { createEmptyProjectRequestSchema, updateProjectRequestSchema } from '../shared'
import { createProjectPathAdapter } from './project-path.adapter'
import { createProjectsRepository } from './projects.repository'
import { createProjectsService } from './projects.service'

const projectIdRequestSchema = z.object({ projectId: z.string().trim().min(1) })

const projectsService = createProjectsService({
  repository: createProjectsRepository(),
  pathAdapter: createProjectPathAdapter()
})

const sessionsService = createSessionsService({
  repository: createSessionsRepository()
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
    const sessions = await sessionsService.archiveProjectSessions(projectId)
    await projectsService.archiveProject(projectId)
    await stopUtilitySessions(sessions.map((session) => session.id))
  })
  ipcMain.handle(IPC_CHANNELS.projects.delete, async (_event, input: unknown) => {
    const { projectId } = projectIdRequestSchema.parse(input)
    const sessions = await sessionsService.deleteProjectSessions(projectId)
    await projectsService.deleteProject(projectId)
    await stopUtilitySessions(sessions.map((session) => session.id))
    await Promise.all(
      sessions.map((session) =>
        session.transcriptPath ? rm(session.transcriptPath, { force: true }).catch(() => undefined) : undefined
      )
    )
  })
}

async function stopUtilitySessions(sessionIds: string[]): Promise<void> {
  await Promise.all(
    sessionIds.map((sessionId) =>
      getAgentUtilityProcessHost().deleteSession({ sessionId }).catch(() => undefined)
    )
  )
}
