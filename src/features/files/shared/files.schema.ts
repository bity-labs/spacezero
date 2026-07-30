import { z } from 'zod'

import { KNOWLEDGE_BASE_FILES_CONTEXT_KEY } from './files.contract'

const relativePathSchema = z
  .string()
  .max(4096)
  .refine(
    (path) =>
      !path.startsWith('/') &&
      !/^[a-z]:/i.test(path) &&
      !path.includes('\\') &&
      !path.includes('\0')
  )
  .refine((path) => {
    if (path === '') return true
    const segments = path.split('/')
    return !segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === '.' ||
        segment === '..' ||
        segment.toLowerCase() === '.git'
    )
  })

const relativeFilePathSchema = relativePathSchema.refine((path) => path.length > 0)

const filesContextSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('project-home'),
      projectId: z.string().trim().min(1)
    })
    .strict(),
  z
    .object({
      kind: z.literal('project-session'),
      sessionId: z.string().trim().min(1)
    })
    .strict(),
  z
    .object({
      kind: z.literal('knowledge-base'),
      contextKey: z.literal(KNOWLEDGE_BASE_FILES_CONTEXT_KEY)
    })
    .strict()
])

export const listFilesTreeRequestSchema = z
  .object({
    context: filesContextSchema
  })
  .strict()

export const listFilesDirectoryRequestSchema = z
  .object({
    context: filesContextSchema,
    relativePath: relativePathSchema
  })
  .strict()

export const openFilesDocumentRequestSchema = z
  .object({
    context: filesContextSchema,
    relativePath: relativeFilePathSchema
  })
  .strict()

export const saveFilesDocumentRequestSchema = z
  .object({
    context: filesContextSchema,
    relativePath: relativeFilePathSchema,
    content: z.string().max(2 * 1024 * 1024),
    expectedRevision: z.string().trim().min(1),
    conflictResolution: z
      .discriminatedUnion('kind', [
        z
          .object({ kind: z.literal('overwrite'), acknowledgedRevision: z.string().trim().min(1) })
          .strict(),
        z
          .object({
            kind: z.literal('recreate'),
            acknowledgedMissingRevision: z.string().trim().min(1)
          })
          .strict()
      ])
      .optional()
  })
  .strict()

export const createFilesEntryRequestSchema = z
  .object({
    context: filesContextSchema,
    relativePath: relativeFilePathSchema,
    kind: z.enum(['file', 'folder'])
  })
  .strict()

export const moveFilesEntryRequestSchema = z
  .object({
    context: filesContextSchema,
    sourcePath: relativeFilePathSchema,
    destinationPath: relativeFilePathSchema
  })
  .strict()

export const trashFilesEntryRequestSchema = z
  .object({
    context: filesContextSchema,
    relativePath: relativeFilePathSchema
  })
  .strict()

export const revealFilesEntryRequestSchema = z
  .object({
    context: filesContextSchema,
    relativePath: relativeFilePathSchema
  })
  .strict()

const searchRequestIdSchema = z.string().trim().min(1).max(200)

export const searchFilesRequestSchema = z
  .object({
    context: filesContextSchema,
    query: z.string().trim().min(1).max(200),
    includeIgnored: z.boolean(),
    requestId: searchRequestIdSchema,
    maxResults: z.number().int().min(1).max(200).optional()
  })
  .strict()

export const cancelFilesSearchRequestSchema = z
  .object({
    context: filesContextSchema,
    requestId: searchRequestIdSchema
  })
  .strict()

const filesSubscriptionIdSchema = z.string().trim().min(1).max(200)

export const observeFilesRequestSchema = z
  .object({
    context: filesContextSchema,
    subscriptionId: filesSubscriptionIdSchema
  })
  .strict()

export const unobserveFilesRequestSchema = z
  .object({
    subscriptionId: filesSubscriptionIdSchema
  })
  .strict()
