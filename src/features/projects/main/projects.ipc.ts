import { ipcMain } from 'electron'

import { IPC_CHANNELS } from '../../../shared/ipc'
import { createEmptyProjectRequestSchema, updateProjectRequestSchema } from '../shared'
import { createProjectPathAdapter } from './project-path.adapter'
import { createProjectsRepository } from './projects.repository'
import { createProjectsService } from './projects.service'

const projectsService = createProjectsService({
  repository: createProjectsRepository(),
  pathAdapter: createProjectPathAdapter()
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
}
