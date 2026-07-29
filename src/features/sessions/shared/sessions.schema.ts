import { z } from 'zod'

export const createProjectSessionRequestSchema = z.object({
  projectId: z.string().trim().min(1),
  title: z.string().trim().min(1).optional()
})

export const resumeProjectChatContextRequestSchema = z.object({
  sessionId: z.string().trim().min(1).max(255),
  chatContextId: z.string().trim().min(1).max(255)
})

export const renameSessionTitleRequestSchema = z.object({
  sessionId: z.string().trim().min(1),
  title: z.string().trim().min(1, 'Session title is required')
})
