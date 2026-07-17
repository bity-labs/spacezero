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

const githubNumberSchema = z.number().int().positive().max(2_147_483_647)
const githubPageSchema = z.number().int().positive().max(10_000)

export const githubIssueListRequestSchema = githubProjectRequestSchema.extend({
  page: githubPageSchema,
  perPage: z.number().int().min(1).max(100).optional()
})

export const githubIssueRequestSchema = githubProjectRequestSchema.extend({
  number: githubNumberSchema
})

export const githubIssueCommentsRequestSchema = githubIssueRequestSchema.extend({
  page: githubPageSchema,
  perPage: z.number().int().min(1).max(100).optional()
})

export const startGitHubCloneRequestSchema = z.object({ repositoryId: repositoryIdSchema })

export const cancelGitHubCloneRequestSchema = z.object({
  operationId: z.string().trim().min(1).max(128)
})
