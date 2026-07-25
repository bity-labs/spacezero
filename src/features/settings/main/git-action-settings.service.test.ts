import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../main/db', () => ({
  getDatabase: () => createFakeDb()
}))

const appSettings = new Map<string, string>()

import { updateGitActionSettingsRequestSchema } from '../../../shared/git-action-settings'
import { getGitActionSettings, updateGitActionSettings } from './git-action-settings.service'

beforeEach(() => {
  appSettings.clear()
})

describe('git action settings', () => {
  it('defaults the primary Git composer action to Commit & Push', async () => {
    await expect(getGitActionSettings()).resolves.toEqual({
      primaryGitAction: 'commit-and-push'
    })
  })

  it('persists and restores the primary Git composer action through app settings', async () => {
    await expect(updateGitActionSettings({ primaryGitAction: 'commit' })).resolves.toEqual({
      primaryGitAction: 'commit'
    })

    await expect(getGitActionSettings()).resolves.toEqual({ primaryGitAction: 'commit' })
  })

  it('validates update requests to supported Git composer actions only', () => {
    expect(
      updateGitActionSettingsRequestSchema.safeParse({ primaryGitAction: 'commit' }).success
    ).toBe(true)
    expect(
      updateGitActionSettingsRequestSchema.safeParse({ primaryGitAction: 'push' }).success
    ).toBe(false)
  })

  it('falls back to Commit & Push when stored application state is invalid', async () => {
    appSettings.set('git.primaryComposerAction', 'push')

    await expect(getGitActionSettings()).resolves.toEqual({
      primaryGitAction: 'commit-and-push'
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
  const value = appSettings.get('git.primaryComposerAction')
  return value ? [{ value }] : []
}
