import { eq } from 'drizzle-orm'

import { getDatabase } from '../../../main/db'
import * as schema from '../../../main/db/schema'
import type {
  ChatLinkDestination,
  ChatLinkSettings,
  UpdateChatLinkSettingsRequest
} from '../../../shared/chat-link-settings'
import { CHAT_LINK_DESTINATIONS } from '../../../shared/chat-link-settings'

const CHAT_LINK_DESTINATION_KEY = 'chatLinks.openIn'
const DEFAULT_CHAT_LINK_DESTINATION: ChatLinkDestination = 'space-zero-browser'

export async function getChatLinkSettings(): Promise<ChatLinkSettings> {
  return { openChatLinksIn: await readChatLinkDestination() }
}

export async function updateChatLinkSettings(
  request: UpdateChatLinkSettingsRequest
): Promise<ChatLinkSettings> {
  const db = getDatabase()
  const now = new Date()

  await db
    .insert(schema.appSettings)
    .values({ key: CHAT_LINK_DESTINATION_KEY, value: request.openChatLinksIn, updatedAt: now })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value: request.openChatLinksIn, updatedAt: now }
    })

  return { openChatLinksIn: request.openChatLinksIn }
}

async function readChatLinkDestination(): Promise<ChatLinkDestination> {
  const db = getDatabase()
  const [storedSetting] = await db
    .select({ value: schema.appSettings.value })
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, CHAT_LINK_DESTINATION_KEY))
    .limit(1)

  return isChatLinkDestination(storedSetting?.value)
    ? storedSetting.value
    : DEFAULT_CHAT_LINK_DESTINATION
}

function isChatLinkDestination(value: unknown): value is ChatLinkDestination {
  return typeof value === 'string' && CHAT_LINK_DESTINATIONS.includes(value as ChatLinkDestination)
}
