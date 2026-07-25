import { ipcMain } from 'electron'

import { GIT_IPC_CHANNELS, getProjectSessionGitReviewSchema } from '../shared'
import { getGitService } from './git.runtime'

export function registerGitIpc(): void {
  ipcMain.handle(GIT_IPC_CHANNELS.getProjectSessionReview, async (_event, request: unknown) => {
    const parsed = getProjectSessionGitReviewSchema.parse(request)
    return getGitService().getProjectSessionReview(parsed.sessionId)
  })
}
