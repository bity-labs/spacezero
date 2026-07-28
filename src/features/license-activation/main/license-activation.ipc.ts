import { ipcMain } from 'electron'

import { IPC_CHANNELS } from '../../../shared/ipc'
import type { ActivateLicenseRequest } from '../shared'
import { licenseActivationService } from './license-activation.runtime'

export function registerLicenseActivationIpc(): void {
  ipcMain.handle(IPC_CHANNELS.licenseActivation.getStatus, () => licenseActivationService.getStatus())
  ipcMain.handle(IPC_CHANNELS.licenseActivation.activate, (_event, request: ActivateLicenseRequest) =>
    licenseActivationService.activate(request)
  )
}
