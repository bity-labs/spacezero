import { z } from 'zod'

import { providerIdSchema } from './model-auth'

export const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const

export type ThinkingLevel = (typeof THINKING_LEVELS)[number]

export type DefaultModelSetting = {
  providerId: string
  modelId: string
}

export type ModelDefaults = {
  defaultModel?: DefaultModelSetting
  defaultThinking: ThinkingLevel
}

export type UpdateModelDefaultsRequest = {
  defaultModel?: DefaultModelSetting
  defaultThinking?: ThinkingLevel
}

export type SetAgentModelRequest = {
  sessionId: string
  provider: string
  modelId: string
}

export type SetAgentThinkingLevelRequest = {
  sessionId: string
  level: ThinkingLevel
}

export type AvailableModel = {
  providerId: string
  providerLabel: string
  modelId: string
  modelLabel: string
  description?: string
  contextWindow?: number
  supportsThinking?: boolean
}

export const thinkingLevelSchema = z.enum(THINKING_LEVELS)

export const defaultModelSettingSchema = z.object({
  providerId: providerIdSchema,
  modelId: z.string().min(1).max(200)
})

export const updateModelDefaultsRequestSchema = z.object({
  defaultModel: defaultModelSettingSchema.optional(),
  defaultThinking: thinkingLevelSchema.optional()
})

export const setAgentModelRequestSchema = z.object({
  sessionId: z.string().trim().min(1),
  provider: providerIdSchema,
  modelId: z.string().min(1).max(200)
})

export const setAgentThinkingLevelRequestSchema = z.object({
  sessionId: z.string().trim().min(1),
  level: thinkingLevelSchema
})
