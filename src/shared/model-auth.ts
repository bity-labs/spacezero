import { z } from 'zod'

export const AUTH_PROVIDER_SOURCES = [
  'stored',
  'environment',
  'runtime',
  'models_json_key',
  'models_json_command',
  'fallback'
] as const

export type AuthProviderSource = (typeof AUTH_PROVIDER_SOURCES)[number]

export type AuthProviderStatus = {
  providerId: string
  label: string
  configured: boolean
  source?: AuthProviderSource
  displayLabel?: string
  removable: boolean
}

export type AuthProviderOption = {
  providerId: string
  label: string
  description?: string
}

export type ModelAuthSettings = {
  subscriptions: {
    connected: AuthProviderStatus[]
    availableProviders: AuthProviderOption[]
  }
  apiKeys: {
    configured: AuthProviderStatus[]
    availableProviders: AuthProviderOption[]
  }
}

export type AuthTestResult = {
  ok: boolean
  message?: string
}

export const providerIdSchema = z.string().min(1).max(100).regex(/^[a-z0-9_.-]+$/)

export const addApiKeyRequestSchema = z.object({
  providerId: providerIdSchema,
  apiKey: z.string().min(1)
})

export const providerRequestSchema = z.object({
  providerId: providerIdSchema
})

export type AddApiKeyRequest = z.infer<typeof addApiKeyRequestSchema>
export type ProviderRequest = z.infer<typeof providerRequestSchema>
