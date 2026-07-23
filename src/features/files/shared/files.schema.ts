import { z } from 'zod'

const relativeDirectoryPathSchema = z
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

export const listFilesDirectoryRequestSchema = z
  .object({
    sessionId: z.string().trim().min(1),
    relativePath: relativeDirectoryPathSchema
  })
  .strict()
