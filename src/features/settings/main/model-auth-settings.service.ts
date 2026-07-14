import type { AuthTestResult, ModelAuthSettings } from '../../../shared/model-auth'
import type { AvailableModel } from '../../../shared/model-settings'
import { getAgentUtilityProcessHost } from '../../agent-workspace/main/agent-utility-process'

export async function getModelAuthSettings(): Promise<ModelAuthSettings> {
  return getAgentUtilityProcessHost().getAuthStatus()
}

export async function getAvailableModels(): Promise<AvailableModel[]> {
  return getAgentUtilityProcessHost().getAvailableModels()
}

export async function addApiKey(providerId: string, apiKey: string): Promise<void> {
  return getAgentUtilityProcessHost().addApiKey({ providerId, apiKey })
}

export async function removeApiKey(providerId: string): Promise<void> {
  return getAgentUtilityProcessHost().removeApiKey({ providerId })
}

export async function testAuth(providerId: string): Promise<AuthTestResult> {
  return getAgentUtilityProcessHost().testAuth({ providerId })
}

export async function loginOAuth(providerId: string): Promise<void> {
  return getAgentUtilityProcessHost().loginOAuth({ providerId })
}

export async function logoutOAuth(providerId: string): Promise<void> {
  return getAgentUtilityProcessHost().logoutOAuth({ providerId })
}
