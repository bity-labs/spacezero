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

export async function loginOAuth(_providerId: string): Promise<void> {
  throw new Error('agent.oauthNotImplemented')
}

export async function logoutOAuth(_providerId: string): Promise<void> {
  throw new Error('agent.oauthNotImplemented')
}
