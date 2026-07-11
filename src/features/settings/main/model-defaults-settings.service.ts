import { eq } from 'drizzle-orm'

import { getDatabase } from '../../../main/db'
import * as schema from '../../../main/db/schema'
import type {
  DefaultModelSetting,
  ModelDefaults,
  ThinkingLevel,
  UpdateModelDefaultsRequest
} from '../../../shared/model-settings'
import { THINKING_LEVELS } from '../../../shared/model-settings'
import { getAvailableModels } from './model-auth-settings.service'

const DEFAULT_MODEL_KEY = 'modelDefaults.defaultModel'
const DEFAULT_THINKING_KEY = 'modelDefaults.defaultThinking'
const FALLBACK_THINKING: ThinkingLevel = 'medium'

export async function getModelDefaults(): Promise<ModelDefaults> {
  const [defaultModel, defaultThinking] = await Promise.all([
    readDefaultModel(),
    readDefaultThinking()
  ])

  return {
    ...(defaultModel ? { defaultModel } : {}),
    defaultThinking
  }
}

export async function updateModelDefaults(
  input: UpdateModelDefaultsRequest
): Promise<ModelDefaults> {
  if (input.defaultModel) {
    await assertDefaultModelIsAvailable(input.defaultModel)
    await writeSetting(DEFAULT_MODEL_KEY, JSON.stringify(input.defaultModel))
  }

  if (input.defaultThinking) {
    await writeSetting(DEFAULT_THINKING_KEY, input.defaultThinking)
  }

  return getModelDefaults()
}

async function assertDefaultModelIsAvailable(defaultModel: DefaultModelSetting): Promise<void> {
  const availableModels = await getAvailableModels()
  const isAvailable = availableModels.some(
    (model) =>
      model.providerId === defaultModel.providerId && model.modelId === defaultModel.modelId
  )

  if (!isAvailable) {
    throw new Error('settings.unavailableDefaultModel')
  }
}

async function readDefaultModel(): Promise<DefaultModelSetting | undefined> {
  const value = await readSetting(DEFAULT_MODEL_KEY)
  if (!value) return undefined

  try {
    const parsed = JSON.parse(value) as Partial<DefaultModelSetting>
    if (typeof parsed.providerId === 'string' && typeof parsed.modelId === 'string') {
      return { providerId: parsed.providerId, modelId: parsed.modelId }
    }
  } catch {
    return undefined
  }

  return undefined
}

async function readDefaultThinking(): Promise<ThinkingLevel> {
  const value = await readSetting(DEFAULT_THINKING_KEY)
  return THINKING_LEVELS.includes(value as ThinkingLevel)
    ? (value as ThinkingLevel)
    : FALLBACK_THINKING
}

async function readSetting(key: string): Promise<string | undefined> {
  const db = getDatabase()
  const [storedSetting] = await db
    .select({ value: schema.appSettings.value })
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, key))
    .limit(1)

  return storedSetting?.value
}

async function writeSetting(key: string, value: string): Promise<void> {
  const db = getDatabase()
  const now = new Date()

  await db
    .insert(schema.appSettings)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value, updatedAt: now }
    })
}
