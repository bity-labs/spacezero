import { describe, expect, it, vi } from 'vitest'

import { findSpaceZeroOAuthUrl, isSpaceZeroOAuthUrl, registerSpaceZeroProtocol, routeSpaceZeroOAuthUrl } from './protocol'
import { getAgentUtilityProcessHost } from '../features/agent-workspace/main/agent-utility-process'
import { app } from 'electron'

vi.mock('electron', () => ({
  app: {
    setAsDefaultProtocolClient: vi.fn(() => true)
  }
}))

vi.mock('../features/agent-workspace/main/agent-utility-process', () => ({
  getAgentUtilityProcessHost: vi.fn()
}))

describe('spacezero protocol routing', () => {
  it('registers spacezero as the default protocol client', () => {
    expect(registerSpaceZeroProtocol()).toBe(true)
    expect(app.setAsDefaultProtocolClient).toHaveBeenCalledWith('spacezero')
  })

  it('recognizes only Space Zero OAuth deep links', () => {
    expect(isSpaceZeroOAuthUrl('spacezero://oauth/github-copilot?code=abc')).toBe(true)
    expect(isSpaceZeroOAuthUrl('spacezero://projects/123')).toBe(false)
    expect(isSpaceZeroOAuthUrl('https://example.com')).toBe(false)
  })

  it('finds OAuth redirects in process arguments', () => {
    expect(findSpaceZeroOAuthUrl(['--flag', 'spacezero://oauth/claude?code=abc'])).toBe('spacezero://oauth/claude?code=abc')
  })

  it('routes OAuth redirects to the agent utility', async () => {
    vi.mocked(getAgentUtilityProcessHost).mockReturnValue({
      handleOAuthCallback: vi.fn(async () => ({ handled: true }))
    } as unknown as ReturnType<typeof getAgentUtilityProcessHost>)

    await expect(routeSpaceZeroOAuthUrl('spacezero://oauth/claude?code=abc')).resolves.toBe(true)
    expect(getAgentUtilityProcessHost().handleOAuthCallback).toHaveBeenCalledWith({ url: 'spacezero://oauth/claude?code=abc' })
  })
})
