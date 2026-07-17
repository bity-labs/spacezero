import { describe, expect, it } from 'vitest'

import { createOnboardingService, type OnboardingCompletionRepository } from './onboarding.service'

function createRepository(): OnboardingCompletionRepository {
  let completed = false
  return {
    async isCompleted() {
      return completed
    },
    async markCompleted() {
      completed = true
    }
  }
}

describe('onboarding service', () => {
  it('persists skip/completion so a later launch enters the workspace', async () => {
    const repository = createRepository()
    const firstLaunch = createOnboardingService({ repository })

    await expect(firstLaunch.getStatus()).resolves.toEqual({ completed: false })
    await expect(firstLaunch.complete()).resolves.toEqual({ completed: true })

    const laterLaunch = createOnboardingService({ repository })
    await expect(laterLaunch.getStatus()).resolves.toEqual({ completed: true })
  })
})
