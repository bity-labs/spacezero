import { describe, expect, it } from 'vitest'

import {
  resumeGlobalChatContextRequestSchema,
  resumeProjectChatContextRequestSchema
} from './sessions.schema'

describe('Global Chat Context requests', () => {
  it('validates and trims a resume selection', () => {
    expect(
      resumeGlobalChatContextRequestSchema.parse({ chatContextId: ' global-chat-context-older ' })
    ).toEqual({ chatContextId: 'global-chat-context-older' })

    expect(() => resumeGlobalChatContextRequestSchema.parse({ chatContextId: ' ' })).toThrow()
  })
})

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
