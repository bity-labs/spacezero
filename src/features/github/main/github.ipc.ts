import { ipcMain } from 'electron'

import { IPC_CHANNELS } from '../../../shared/ipc'
import { githubFlowRequestSchema } from '../shared'
import { getGitHubAuthService } from './github-runtime'

export function registerGitHubIpc(): void {
  ipcMain.handle(IPC_CHANNELS.github.getConnection, () => getGitHubAuthService().getConnection())
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
}
