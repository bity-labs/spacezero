import { z } from 'zod'

export const gitChangeFilterSchema = z.enum(['uncommitted', 'unstaged', 'staged'])

export const gitContextSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('project-session'), sessionId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('knowledge-base'), contextKey: z.literal('knowledge-base') }).strict()
])

export const getGitReviewSchema = z.object({
  context: gitContextSchema,
  filter: gitChangeFilterSchema.default('uncommitted')
})

export const getProjectSessionGitReviewSchema = z.object({
  sessionId: z.string().min(1),
  filter: gitChangeFilterSchema.default('uncommitted')
})

export const observeGitSchema = z.object({
  context: gitContextSchema
})

export const observeProjectSessionGitSchema = z.object({
  sessionId: z.string().min(1)
})

export const unobserveProjectSessionGitSchema = z.object({
  subscriptionId: z.string().min(1)
})
