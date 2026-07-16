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

export const createKnowledgeBaseItemRequestSchema = z.object({
  relativePath: z.string().trim().min(1, 'Knowledge Base path is required'),
  kind: z.enum(['file', 'folder'])
})

export const renameKnowledgeBaseItemRequestSchema = z.object({
  relativePath: z.string().trim().min(1, 'Knowledge Base path is required'),
  newName: z.string().trim().min(1, 'Knowledge Base item name is required')
})

export const moveKnowledgeBaseItemRequestSchema = z.object({
  sourcePath: z.string().trim().min(1, 'Source path is required'),
  destinationPath: z.string().trim().min(1, 'Destination path is required')
})

export const saveKnowledgeBaseDocumentRequestSchema = z.object({
  relativePath: z.string().trim().min(1, 'Knowledge Base path is required'),
  content: z.string().max(2 * 1024 * 1024, 'Knowledge Base document is too large'),
  expectedRevision: z.string().min(1, 'Document revision is required')
})

export const checkKnowledgeBaseDocumentRequestSchema = z.object({
  relativePath: z.string().trim().min(1, 'Knowledge Base path is required'),
  revision: z.string().min(1, 'Document revision is required')
})
