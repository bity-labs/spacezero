import { ipcMain } from 'electron'

import { IPC_CHANNELS } from '../../../shared/ipc'
import { licenseActivationService } from '../../license-activation/main/license-activation.runtime'
import { createOnboardingCompletionRepository } from './onboarding.repository'
import { createOnboardingService } from './onboarding.service'

const onboarding = createOnboardingService({
  activationGate: licenseActivationService,
  repository: createOnboardingCompletionRepository()
})

export function registerOnboardingIpc(): void {
  ipcMain.handle(IPC_CHANNELS.onboarding.getStatus, () => onboarding.getStatus())
  ipcMain.handle(IPC_CHANNELS.onboarding.complete, () => onboarding.complete())
}
