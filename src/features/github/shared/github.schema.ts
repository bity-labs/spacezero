import { z } from 'zod'

export const githubFlowRequestSchema = z.object({
  flowId: z.string().trim().min(1).max(128)
})

export const githubProjectRequestSchema = z.object({
  projectId: z.string().trim().min(1).max(128)
})

export const linkGitHubProjectRequestSchema = githubProjectRequestSchema.extend({
  repositoryId: z.string().regex(/^\d+$/, 'Repository ID must be numeric'),
  confirmAmbiguous: z.boolean().optional()
})
