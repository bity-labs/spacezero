import { z } from 'zod'

export const browserContextSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('project-session'), projectId: z.string().min(1), sessionId: z.string().min(1) }),
  z.object({ kind: z.literal('workspace-session'), sessionId: z.string().min(1) }),
  z.object({ kind: z.literal('knowledge-base') })
])

const contextRequestFields = {
  contextKey: z.string().min(1),
  context: browserContextSchema
}

export const browserContextRequestSchema = z.object(contextRequestFields)

export const browserBoundsSchema = z.object({
  x: z.number().int().finite().min(0),
  y: z.number().int().finite().min(0),
  width: z.number().int().finite().min(1).max(10000),
  height: z.number().int().finite().min(1).max(10000)
})

export const browserTabRequestSchema = z.object({
  ...contextRequestFields,
  tabId: z.string().min(1).optional()
})

export const browserNavigateRequestSchema = z.object({
  ...contextRequestFields,
  tabId: z.string().min(1).optional(),
  input: z.string().min(1).max(4096)
})

export const browserPresentationRequestSchema = z.object({
  ...contextRequestFields,
  tabId: z.string().min(1).optional(),
  bounds: browserBoundsSchema
})

export const browserCloseTabRequestSchema = z.object({
  ...contextRequestFields,
  tabId: z.string().min(1)
})
