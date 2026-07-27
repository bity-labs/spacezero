import { z } from 'zod'

export const createEmptyProjectRequestSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required'),
  agentResourcesTrusted: z.boolean().default(false)
})

export const addProjectFromFolderRequestSchema = z
  .object({
    agentResourcesTrusted: z.boolean().default(false)
  })
  .optional()
  .default({ agentResourcesTrusted: false })

export const updateProjectRequestSchema = z.object({
  id: z.string().trim().min(1, 'Project id is required'),
  name: z.string().trim().min(1, 'Project name is required'),
  path: z.string().trim().min(1, 'Project path is required'),
  agentResourcesTrusted: z.boolean().optional()
})
