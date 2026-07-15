import { app } from 'electron'

import { getAgentUtilityProcessHost } from '../features/agent-workspace/main/agent-utility-process'

export const SPACEZERO_PROTOCOL = 'spacezero'

export function registerSpaceZeroProtocol(): boolean {
  return app.setAsDefaultProtocolClient(SPACEZERO_PROTOCOL)
}

export function isSpaceZeroOAuthUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url)
    return parsedUrl.protocol === `${SPACEZERO_PROTOCOL}:` && parsedUrl.hostname === 'oauth'
  } catch {
    return false
  }
}

export async function routeSpaceZeroOAuthUrl(url: string): Promise<boolean> {
  if (!isSpaceZeroOAuthUrl(url)) return false

  const result = await getAgentUtilityProcessHost().handleOAuthCallback({ url })
  return result.handled
}

export function findSpaceZeroOAuthUrl(argv: readonly string[]): string | undefined {
  return argv.find(isSpaceZeroOAuthUrl)
}
