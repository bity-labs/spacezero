import type { LicenseActivationStatus } from '../../license-activation/shared'
import type { OnboardingStatus } from '../shared'

export type OnboardingCompletionRepository = {
  isCompleted: () => Promise<boolean>
  markCompleted: () => Promise<void>
}

export type OnboardingActivationGate = {
  getStatus: () => Promise<Pick<LicenseActivationStatus, 'canEnterWorkspace'>>
}

export function createOnboardingService({
  activationGate,
  repository
}: {
  activationGate: OnboardingActivationGate
  repository: OnboardingCompletionRepository
}) {
  return {
    async getStatus(): Promise<OnboardingStatus> {
      return { completed: await repository.isCompleted() }
    },
    async complete(): Promise<OnboardingStatus> {
      const activation = await activationGate.getStatus()
      if (!activation.canEnterWorkspace) {
        throw new Error('License Activation is required before completing onboarding.')
      }

      await repository.markCompleted()
      return { completed: true }
    }
  }
}
