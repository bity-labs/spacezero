import { ipcMain } from 'electron'

import { IPC_CHANNELS } from '../../../shared/ipc'
import { githubFlowRequestSchema } from '../shared'
import { getGitHubAuthService, getGitHubConnectionService } from './github-runtime'

export function registerGitHubIpc(): void {
  ipcMain.handle(IPC_CHANNELS.github.getConnection, () =>
    getGitHubConnectionService().getConnection()
  )
  ipcMain.handle(IPC_CHANNELS.github.startAuthorization, () =>
    getGitHubAuthService().startAuthorization()
  )
  ipcMain.handle(IPC_CHANNELS.github.waitForAuthorization, (_event, input: unknown) =>
    getGitHubAuthService().waitForAuthorization(githubFlowRequestSchema.parse(input))
  )
  ipcMain.handle(IPC_CHANNELS.github.cancelAuthorization, (_event, input: unknown) =>
    getGitHubAuthService().cancelAuthorization(githubFlowRequestSchema.parse(input))
  )
  ipcMain.handle(IPC_CHANNELS.github.openAuthorization, (_event, input: unknown) =>
    getGitHubAuthService().openAuthorization(githubFlowRequestSchema.parse(input))
  )
  ipcMain.handle(IPC_CHANNELS.github.copyDeviceCode, (_event, input: unknown) =>
    getGitHubAuthService().copyDeviceCode(githubFlowRequestSchema.parse(input))
  )
  ipcMain.handle(IPC_CHANNELS.github.openInstallation, () =>
    getGitHubConnectionService().openInstallation()
  )
  ipcMain.handle(IPC_CHANNELS.github.openManageAccess, () =>
    getGitHubConnectionService().openManageAccess()
  )
  ipcMain.handle(IPC_CHANNELS.github.disconnect, () => getGitHubAuthService().disconnect())
  ipcMain.handle(IPC_CHANNELS.github.listAuthorizedRepositories, () =>
    getGitHubConnectionService().listAuthorizedRepositories()
  )
}
