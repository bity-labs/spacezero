import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../main/db', () => ({
  getDatabase: () => createFakeDb()
}))

const appSettings = new Map<string, string>()

import { updateChatLinkSettingsRequestSchema } from '../../../shared/chat-link-settings'
import { getChatLinkSettings, updateChatLinkSettings } from './chat-link-settings.service'

beforeEach(() => {
  appSettings.clear()
})

describe('chat link settings', () => {
  it('defaults a workspace with no saved preference to Space Zero Browser', async () => {
    await expect(getChatLinkSettings()).resolves.toEqual({
      openChatLinksIn: 'space-zero-browser'
    })
  })

  it('persists and restores the Default browser preference through app settings', async () => {
    await expect(
      updateChatLinkSettings({ openChatLinksIn: 'default-browser' })
    ).resolves.toEqual({ openChatLinksIn: 'default-browser' })

    await expect(getChatLinkSettings()).resolves.toEqual({ openChatLinksIn: 'default-browser' })
  })

  it('validates update requests to the supported destinations only', () => {
    expect(
      updateChatLinkSettingsRequestSchema.safeParse({ openChatLinksIn: 'default-browser' }).success
    ).toBe(true)
    expect(
      updateChatLinkSettingsRequestSchema.safeParse({ openChatLinksIn: 'mailto' }).success
    ).toBe(false)
  })

  it('falls back closed to Space Zero Browser when stored application state is invalid', async () => {
    appSettings.set('chatLinks.openIn', 'file-browser')

    await expect(getChatLinkSettings()).resolves.toEqual({
      openChatLinksIn: 'space-zero-browser'
    })
  })
})

function createFakeDb() {
  return {
    insert: () => ({
      values: (row: { key: string; value: string }) => ({
        onConflictDoUpdate: () => {
          appSettings.set(row.key, row.value)
          return Promise.resolve()
        }
      })
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(readRequestedSetting())
        })
      })
    })
  }
}

function readRequestedSetting(): Array<{ value: string }> {
  const value = appSettings.get('chatLinks.openIn')
  return value ? [{ value }] : []
}
