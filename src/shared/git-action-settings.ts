import { z } from 'zod'

export const GIT_COMPOSER_ACTIONS = [
  'commit',
  'commit-and-push',
  'commit-and-create-pr'
] as const

export type GitComposerAction = (typeof GIT_COMPOSER_ACTIONS)[number]

export type GitActionSettings = {
  primaryGitAction: GitComposerAction
}

export const gitComposerActionSchema = z.enum(GIT_COMPOSER_ACTIONS)

export const updateGitActionSettingsRequestSchema = z.object({
  primaryGitAction: gitComposerActionSchema
})

export type UpdateGitActionSettingsRequest = z.infer<typeof updateGitActionSettingsRequestSchema>
