import { z } from 'zod'

import { BROWSER_COMMAND_IDS } from './browser.contract'

export const browserContextSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('project-home'),
    projectId: z.string().min(1)
  }),
  z.object({
    kind: z.literal('project-session'),
    projectId: z.string().min(1),
    sessionId: z.string().min(1)
  }),
  z.object({ kind: z.literal('workspace-session'), sessionId: z.string().min(1) }),
  z.object({ kind: z.literal('global-chat') }),
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

const browserShortcutBindingSchema = z.object({
  commandId: z.enum([
    BROWSER_COMMAND_IDS.focusAddress,
    BROWSER_COMMAND_IDS.newTab,
    BROWSER_COMMAND_IDS.closeActiveTab,
    BROWSER_COMMAND_IDS.reload,
    BROWSER_COMMAND_IDS.back,
    BROWSER_COMMAND_IDS.forward
  ]),
  keybinding: z.object({ normalized: z.string().min(1).max(64) })
})

export const browserPresentationRequestSchema = z.object({
  ...contextRequestFields,
  tabId: z.string().min(1).optional(),
  bounds: browserBoundsSchema,
  shortcutBindings: z.array(browserShortcutBindingSchema).max(16)
})

export const browserCreateTabRequestSchema = z.object({
  ...contextRequestFields,
  input: z.string().min(1).max(4096).optional()
})

export const browserOpenUrlInDefaultBrowserRequestSchema = z.object({
  url: z.string().min(1).max(4096)
})

export const browserDownloadActionRequestSchema = z.object({
  downloadId: z.string().min(1).max(128)
})

export const browserSelectTabRequestSchema = z.object({
  ...contextRequestFields,
  tabId: z.string().min(1)
})

export const browserCloseTabRequestSchema = z.object({
  ...contextRequestFields,
  tabId: z.string().min(1)
})

export const browserReorderTabsRequestSchema = z.object({
  ...contextRequestFields,
  tabIds: z.array(z.string().min(1)).min(1).max(100)
})
