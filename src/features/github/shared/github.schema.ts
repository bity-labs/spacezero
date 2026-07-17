import { z } from 'zod'

export const githubFlowRequestSchema = z.object({
  flowId: z.string().trim().min(1).max(128)
})
