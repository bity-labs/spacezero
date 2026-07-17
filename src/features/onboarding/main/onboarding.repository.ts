import { eq } from 'drizzle-orm'

import { getDatabase } from '../../../main/db'
import * as schema from '../../../main/db/schema'
import type { OnboardingCompletionRepository } from './onboarding.service'

const ONBOARDING_COMPLETED_KEY = 'onboarding.completed'

export function createOnboardingCompletionRepository(): OnboardingCompletionRepository {
  return {
    async isCompleted() {
      const [setting] = await getDatabase()
        .select({ value: schema.appSettings.value })
        .from(schema.appSettings)
        .where(eq(schema.appSettings.key, ONBOARDING_COMPLETED_KEY))
        .limit(1)
      return setting?.value === 'true'
    },
    async markCompleted() {
      const now = new Date()
      await getDatabase()
        .insert(schema.appSettings)
        .values({ key: ONBOARDING_COMPLETED_KEY, value: 'true', updatedAt: now })
        .onConflictDoUpdate({
          target: schema.appSettings.key,
          set: { value: 'true', updatedAt: now }
        })
    }
  }
}
