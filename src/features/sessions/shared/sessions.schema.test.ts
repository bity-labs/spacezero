import { describe, expect, it } from 'vitest'

import { resumeProjectChatContextRequestSchema } from './sessions.schema'

describe('Project Session Chat Context requests', () => {
  it('validates and trims a scoped resume selection', () => {
    expect(
      resumeProjectChatContextRequestSchema.parse({
        sessionId: ' project-session-1 ',
        chatContextId: ' chat-context-older '
      })
    ).toEqual({
      sessionId: 'project-session-1',
      chatContextId: 'chat-context-older'
    })

    expect(() =>
      resumeProjectChatContextRequestSchema.parse({
        sessionId: 'project-session-1',
        chatContextId: ' '
      })
    ).toThrow()
  })
})
