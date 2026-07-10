import { z } from 'zod'

export const createProjectSessionRequestSchema = z.object({
  projectId: z.string().trim().min(1),
  title: z.string().trim().min(1).optional()
})
