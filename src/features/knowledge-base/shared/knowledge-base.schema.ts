import { z } from 'zod'

export const cloneKnowledgeBaseRequestSchema = z.object({
  gitUrl: z.string().trim().min(1, 'Git repository URL is required')
})

export const knowledgeBasePathRequestSchema = z.object({
  relativePath: z.string().trim().min(1, 'Knowledge Base path is required')
})

export const searchKnowledgeBaseRequestSchema = z.object({
  query: z.string().trim().min(1, 'Search query is required').max(200)
})
