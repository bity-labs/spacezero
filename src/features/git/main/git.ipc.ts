import { randomUUID } from 'node:crypto'

import { ipcMain, type IpcMainInvokeEvent } from 'electron'

import {
  GIT_IPC_CHANNELS,
  getGitReviewSchema,
  getProjectSessionGitReviewSchema,
  observeGitSchema,
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
  ipcMain.handle(GIT_IPC_CHANNELS.getReview, async (_event, request: unknown) => {
    const parsed = getGitReviewSchema.parse(request)
    return getGitService().getReview(parsed.context, parsed.filter)
  })

  ipcMain.handle(GIT_IPC_CHANNELS.getProjectSessionReview, async (_event, request: unknown) => {
    const parsed = getProjectSessionGitReviewSchema.parse(request)
    return getGitService().getProjectSessionReview(parsed.sessionId, parsed.filter)
  })

  ipcMain.handle(GIT_IPC_CHANNELS.observe, async (event, request: unknown) => {
    const parsed = observeGitSchema.parse(request)
    return observeGitContext(event, parsed.context)
  })

  ipcMain.handle(GIT_IPC_CHANNELS.observeProjectSession, async (event, request: unknown) => {
    const parsed = observeProjectSessionGitSchema.parse(request)
    return observeGitContext(event, { kind: 'project-session', sessionId: parsed.sessionId })
  })

  ipcMain.handle(GIT_IPC_CHANNELS.unobserveProjectSession, async (_event, request: unknown) => {
    const parsed = unobserveProjectSessionGitSchema.parse(request)
    closeGitSubscription(parsed.subscriptionId)
  })
}

async function observeGitContext(
  event: IpcMainInvokeEvent,
  context: Parameters<ReturnType<typeof getGitService>['observe']>[0]
): Promise<{ subscriptionId: string }> {
  const subscriptionId = randomUUID()
  const sender = event.sender
  const contextKey =
    context.kind === 'knowledge-base'
      ? context.contextKey
      : context.kind === 'project-home'
        ? `project:${context.projectId}`
        : `session:${context.sessionId}`
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
    close = await getGitService().observe(context, (observation) => {
      if (sender.isDestroyed()) return
      const payload: GitObservationEvent = {
        subscriptionId,
        contextKey,
        ...(context.kind === 'project-session' ? { sessionId: context.sessionId } : {}),
        ...observation
      }
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
}

function closeGitSubscription(subscriptionId: string): void {
  const subscription = subscriptions.get(subscriptionId)
  if (!subscription || subscription.closed) return
  subscription.closed = true
  subscriptions.delete(subscriptionId)
  subscription.removeDestroyedListener()
  subscription.close()
}
