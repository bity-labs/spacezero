import { randomUUID } from 'node:crypto'

import { ipcMain } from 'electron'

import {
  GIT_IPC_CHANNELS,
  getProjectSessionGitReviewSchema,
  observeProjectSessionGitSchema,
  unobserveProjectSessionGitSchema,
  type GitObservationEvent
} from '../shared'
import { getGitService } from './git.runtime'

const subscriptions = new Map<string, { close: () => void }>()

export function registerGitIpc(): void {
  ipcMain.handle(GIT_IPC_CHANNELS.getProjectSessionReview, async (_event, request: unknown) => {
    const parsed = getProjectSessionGitReviewSchema.parse(request)
    return getGitService().getProjectSessionReview(parsed.sessionId, parsed.filter)
  })

  ipcMain.handle(GIT_IPC_CHANNELS.observeProjectSession, async (event, request: unknown) => {
    const parsed = observeProjectSessionGitSchema.parse(request)
    const subscriptionId = randomUUID()
    const sender = event.sender
    const close = await getGitService().observeProjectSession(parsed.sessionId, (observation) => {
      if (sender.isDestroyed()) return
      const payload: GitObservationEvent = { subscriptionId, sessionId: parsed.sessionId, ...observation }
      sender.send(GIT_IPC_CHANNELS.observationEvent, payload)
    })
    subscriptions.set(subscriptionId, { close })
    sender.once('destroyed', () => closeGitSubscription(subscriptionId))
    return { subscriptionId }
  })

  ipcMain.handle(GIT_IPC_CHANNELS.unobserveProjectSession, async (_event, request: unknown) => {
    const parsed = unobserveProjectSessionGitSchema.parse(request)
    closeGitSubscription(parsed.subscriptionId)
  })
}

function closeGitSubscription(subscriptionId: string): void {
  const subscription = subscriptions.get(subscriptionId)
  if (!subscription) return
  subscriptions.delete(subscriptionId)
  subscription.close()
}
