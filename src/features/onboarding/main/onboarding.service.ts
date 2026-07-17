import type { OnboardingStatus } from '../shared'

export type OnboardingCompletionRepository = {
  isCompleted: () => Promise<boolean>
  markCompleted: () => Promise<void>
}

export function createOnboardingService({
  repository
}: {
  repository: OnboardingCompletionRepository
}) {
  return {
    async getStatus(): Promise<OnboardingStatus> {
      return { completed: await repository.isCompleted() }
    },
    async complete(): Promise<OnboardingStatus> {
      await repository.markCompleted()
      return { completed: true }
    }
  }
}
