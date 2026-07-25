import { z } from 'zod'

export const CHAT_LINK_DESTINATIONS = ['space-zero-browser', 'default-browser'] as const

export type ChatLinkDestination = (typeof CHAT_LINK_DESTINATIONS)[number]

export type ChatLinkSettings = {
  openChatLinksIn: ChatLinkDestination
}

export const chatLinkDestinationSchema = z.enum(CHAT_LINK_DESTINATIONS)

export const updateChatLinkSettingsRequestSchema = z.object({
  openChatLinksIn: chatLinkDestinationSchema
})

export type UpdateChatLinkSettingsRequest = z.infer<typeof updateChatLinkSettingsRequestSchema>
