import { z } from 'zod'

export const cloneKnowledgeBaseRequestSchema = z.object({
  gitUrl: z.string().trim().min(1, 'Git repository URL is required')
})
