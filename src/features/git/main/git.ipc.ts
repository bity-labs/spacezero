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

type GitSubscription = {
  close: () => void
  removeDestroyedListener: () => void
  closed: boolean
}

const subscriptions = new Map<string, GitSubscription>()

export function registerGitIpc(): void {
  ipcMain.handle(GIT_IPC_CHANNELS.getProjectSessionReview, async (_event, request: unknown) => {
    const parsed = getProjectSessionGitReviewSchema.parse(request)
    return getGitService().getProjectSessionReview(parsed.sessionId, parsed.filter)
  })

  ipcMain.handle(GIT_IPC_CHANNELS.observeProjectSession, async (event, request: unknown) => {
    const parsed = observeProjectSessionGitSchema.parse(request)
    const subscriptionId = randomUUID()
    const sender = event.sender
    let senderDestroyed = sender.isDestroyed()
    const onSenderDestroyed = (): void => {
      senderDestroyed = true
      closeGitSubscription(subscriptionId)
    }
    sender.once('destroyed', onSenderDestroyed)

    const removeDestroyedListener = (): void => {
      sender.off('destroyed', onSenderDestroyed)
    }

    let close: () => void
    try {
      close = await getGitService().observeProjectSession(parsed.sessionId, (observation) => {
        if (sender.isDestroyed()) return
        const payload: GitObservationEvent = { subscriptionId, sessionId: parsed.sessionId, ...observation }
        sender.send(GIT_IPC_CHANNELS.observationEvent, payload)
      })
    } catch (error) {
      removeDestroyedListener()
      throw error
    }

    const subscription: GitSubscription = { close, removeDestroyedListener, closed: false }
    subscriptions.set(subscriptionId, subscription)
    if (senderDestroyed || sender.isDestroyed()) closeGitSubscription(subscriptionId)
    return { subscriptionId }
  })

  ipcMain.handle(GIT_IPC_CHANNELS.unobserveProjectSession, async (_event, request: unknown) => {
    const parsed = unobserveProjectSessionGitSchema.parse(request)
    closeGitSubscription(parsed.subscriptionId)
  })
}

function closeGitSubscription(subscriptionId: string): void {
  const subscription = subscriptions.get(subscriptionId)
  if (!subscription || subscription.closed) return
  subscription.closed = true
  subscriptions.delete(subscriptionId)
  subscription.removeDestroyedListener()
  subscription.close()
}
