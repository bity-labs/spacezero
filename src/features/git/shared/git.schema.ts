import { z } from 'zod'

export const gitChangeFilterSchema = z.enum(['uncommitted', 'unstaged', 'staged'])

export const getProjectSessionGitReviewSchema = z.object({
  sessionId: z.string().min(1),
  filter: gitChangeFilterSchema.default('uncommitted')
})
