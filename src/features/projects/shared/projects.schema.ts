import { z } from 'zod'

export const createEmptyProjectRequestSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required')
})

export const updateProjectRequestSchema = z.object({
  id: z.string().trim().min(1, 'Project id is required'),
  name: z.string().trim().min(1, 'Project name is required'),
  path: z.string().trim().min(1, 'Project path is required')
})
