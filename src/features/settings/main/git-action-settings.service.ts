import { eq } from 'drizzle-orm'

import { getDatabase } from '../../../main/db'
import * as schema from '../../../main/db/schema'
import type {
  GitActionSettings,
  GitComposerAction,
  UpdateGitActionSettingsRequest
} from '../../../shared/git-action-settings'
import { GIT_COMPOSER_ACTIONS } from '../../../shared/git-action-settings'

const PRIMARY_GIT_ACTION_KEY = 'git.primaryComposerAction'
const DEFAULT_PRIMARY_GIT_ACTION: GitComposerAction = 'commit-and-push'

export async function getGitActionSettings(): Promise<GitActionSettings> {
  return { primaryGitAction: await readPrimaryGitAction() }
}

export async function updateGitActionSettings(
  request: UpdateGitActionSettingsRequest
): Promise<GitActionSettings> {
  const db = getDatabase()
  const now = new Date()

  await db
    .insert(schema.appSettings)
    .values({ key: PRIMARY_GIT_ACTION_KEY, value: request.primaryGitAction, updatedAt: now })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value: request.primaryGitAction, updatedAt: now }
    })

  return { primaryGitAction: request.primaryGitAction }
}

async function readPrimaryGitAction(): Promise<GitComposerAction> {
  const db = getDatabase()
  const [storedSetting] = await db
    .select({ value: schema.appSettings.value })
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, PRIMARY_GIT_ACTION_KEY))
    .limit(1)

  return isGitComposerAction(storedSetting?.value)
    ? storedSetting.value
    : DEFAULT_PRIMARY_GIT_ACTION
}

function isGitComposerAction(value: unknown): value is GitComposerAction {
  return typeof value === 'string' && GIT_COMPOSER_ACTIONS.includes(value as GitComposerAction)
}
