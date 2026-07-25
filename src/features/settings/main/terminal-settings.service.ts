import { eq } from 'drizzle-orm'

import { getDatabase } from '../../../main/db'
import * as schema from '../../../main/db/schema'
import {
  DEFAULT_TERMINAL_SETTINGS,
  type TerminalSettings,
  type UpdateTerminalSettingsRequest
} from '../../../shared/terminal-settings'

const TERMINAL_CONFIRM_CLOSE_KEY = 'terminal.confirmBeforeClosingLiveTerminals'

export async function getTerminalSettings(): Promise<TerminalSettings> {
  const db = getDatabase()
  const [storedSetting] = await db
    .select({ value: schema.appSettings.value })
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, TERMINAL_CONFIRM_CLOSE_KEY))
    .limit(1)

  return {
    confirmBeforeClosingLiveTerminals:
      storedSetting?.value === 'false'
        ? false
        : DEFAULT_TERMINAL_SETTINGS.confirmBeforeClosingLiveTerminals
  }
}

export async function updateTerminalSettings(
  request: UpdateTerminalSettingsRequest
): Promise<TerminalSettings> {
  const db = getDatabase()
  const now = new Date()
  const value = String(request.confirmBeforeClosingLiveTerminals)

  await db
    .insert(schema.appSettings)
    .values({ key: TERMINAL_CONFIRM_CLOSE_KEY, value, updatedAt: now })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value, updatedAt: now }
    })

  return getTerminalSettings()
}
