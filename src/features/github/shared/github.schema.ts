import { z } from 'zod'

export const githubFlowRequestSchema = z.object({
  flowId: z.string().trim().min(1).max(128)
})

export const githubProjectRequestSchema = z.object({
  projectId: z.string().trim().min(1).max(128)
})

export const repositoryIdSchema = z.string().regex(/^\d+$/, 'Repository ID must be numeric')

export const linkGitHubProjectRequestSchema = githubProjectRequestSchema.extend({
  repositoryId: repositoryIdSchema,
  confirmAmbiguous: z.boolean().optional()
})

export const startGitHubCloneRequestSchema = z.object({ repositoryId: repositoryIdSchema })

export const cancelGitHubCloneRequestSchema = z.object({
  operationId: z.string().trim().min(1).max(128)
})
