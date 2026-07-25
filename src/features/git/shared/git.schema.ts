import { z } from 'zod'

export const getProjectSessionGitReviewSchema = z.object({
  sessionId: z.string().min(1)
})
