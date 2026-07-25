import { z } from 'zod'

export type TerminalSettings = {
  confirmBeforeClosingLiveTerminals: boolean
}

export const terminalSettingsSchema = z.object({
  confirmBeforeClosingLiveTerminals: z.boolean()
})

export type UpdateTerminalSettingsRequest = z.infer<typeof terminalSettingsSchema>

export const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
  confirmBeforeClosingLiveTerminals: true
}
