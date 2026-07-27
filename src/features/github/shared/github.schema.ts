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

export const githubIssueCommentCreateRequestSchema = githubIssueRequestSchema.extend({
  body: z.string().trim().min(1).max(65_536)
})

export const githubIssueStateUpdateRequestSchema = githubIssueRequestSchema.extend({
  state: z.enum(['open', 'closed'])
})

export const githubPullRequestListRequestSchema = githubProjectRequestSchema.extend({
  page: githubPageSchema,
  perPage: z.number().int().min(1).max(100).optional()
})

export const githubPullRequestRequestSchema = githubProjectRequestSchema.extend({
  number: githubNumberSchema
})

export const githubPullRequestCommentsRequestSchema = githubPullRequestRequestSchema.extend({
  page: githubPageSchema,
  perPage: z.number().int().min(1).max(100).optional()
})

export const githubPullRequestPageRequestSchema = githubPullRequestRequestSchema.extend({
  page: githubPageSchema,
  perPage: z.number().int().min(1).max(100).optional()
})

export const githubPullRequestCommentCreateRequestSchema = githubPullRequestRequestSchema.extend({
  body: z.string().trim().min(1).max(65_536)
})

export const githubPullRequestReviewCreateRequestSchema = githubPullRequestRequestSchema
  .extend({
    event: z.enum(['APPROVE', 'REQUEST_CHANGES']),
    body: z.string().trim().max(65_536).optional()
  })
  .superRefine((request, context) => {
    if (request.event === 'REQUEST_CHANGES' && !request.body) {
      context.addIssue({
        code: 'custom',
        path: ['body'],
        message: 'A review body is required when requesting changes.'
      })
    }
  })

export const startGitHubCloneRequestSchema = z.object({
  repositoryId: repositoryIdSchema,
  existingProjectId: z.string().trim().min(1).max(128).optional(),
  agentResourcesTrusted: z.boolean().default(false)
})

export const cancelGitHubCloneRequestSchema = z.object({
  operationId: z.string().trim().min(1).max(128)
})
