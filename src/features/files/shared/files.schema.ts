import { z } from 'zod'

const relativePathSchema = z
  .string()
  .transform((path) => path.trim())
  .pipe(
    z
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
        const segments = path.split('/').filter(Boolean)
        return !segments.some((segment) => segment === '..' || segment.toLowerCase() === '.git')
      })
  )

const relativeFilePathSchema = relativePathSchema.refine((path) => {
  const segments = path.split('/').filter(Boolean)
  return path.length > 0 && !segments.some((segment) => segment === '.')
})

export const listFilesDirectoryRequestSchema = z
  .object({
    sessionId: z.string().trim().min(1),
    relativePath: relativePathSchema
  })
  .strict()

export const openFilesDocumentRequestSchema = z
  .object({
    sessionId: z.string().trim().min(1),
    relativePath: relativeFilePathSchema
  })
  .strict()

export const saveFilesDocumentRequestSchema = z
  .object({
    sessionId: z.string().trim().min(1),
    relativePath: relativeFilePathSchema,
    content: z.string().max(2 * 1024 * 1024),
    expectedRevision: z.string().trim().min(1)
  })
  .strict()
