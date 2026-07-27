import { z } from 'zod'

import { MAX_KNOWLEDGE_BASE_IMAGE_BYTES } from './knowledge-base.model'

export const cloneKnowledgeBaseRequestSchema = z.object({
  gitUrl: z.string().trim().min(1, 'Git repository URL is required')
})

export const knowledgeBasePathRequestSchema = z.object({
  relativePath: z.string().trim().min(1, 'Knowledge Base path is required')
})

export const importKnowledgeBaseImageRequestSchema = z.object({
  documentRelativePath: z.string().trim().min(1).max(1024),
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine(
      (fileName) =>
        [...fileName].every((character) => {
          const codePoint = character.codePointAt(0) ?? 0
          return codePoint > 31 && codePoint !== 127
        }),
      'Image file name is invalid'
    ),
  bytes: z
    .instanceof(Uint8Array)
    .refine(
      (bytes) => bytes.byteLength <= MAX_KNOWLEDGE_BASE_IMAGE_BYTES,
      'Knowledge Base image is too large'
    )
})

export const loadKnowledgeBaseImageRequestSchema = z.object({
  documentRelativePath: z.string().trim().min(1).max(1024),
  markdownPath: z.string().trim().min(1).max(2048)
})

export const saveKnowledgeBaseDocumentRequestSchema = z.object({
  relativePath: z.string().trim().min(1, 'Knowledge Base path is required'),
  content: z.string().max(2 * 1024 * 1024, 'Knowledge Base document is too large'),
  expectedRevision: z.string().min(1, 'Document revision is required')
})
