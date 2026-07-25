import { rm } from 'node:fs/promises'

import { getAgentUtilityProcessHost } from '../../agent-workspace/main/agent-utility-process'
import { getBrowserService } from '../../browser/main/browser.ipc'
import { withProjectLifecycleLock } from '../../projects/main/project-lifecycle-lock'
import { runWithLiveTerminalConfirmation } from '../../terminal/main/terminal-confirmation.service'
import { getTerminalService } from '../../terminal/main/terminal.runtime'
import { getManagedWorktreeService } from './managed-worktree.runtime'
import { createSessionCleanupService } from './session-cleanup.service'
import { createSessionsRepository } from './sessions.repository'
import type { StoredSession } from './sessions.service'

let service: ReturnType<typeof createSessionCleanupService> | undefined

export function getSessionCleanupService(): ReturnType<typeof createSessionCleanupService> {
  service ??= createSessionCleanupService({
    repository: createSessionsRepository(),
    worktrees: {
      remove: (request) => getManagedWorktreeService().remove(request)
    },
    deleteUtilitySession: (request) => getAgentUtilityProcessHost().deleteSession(request),
    removeTranscript: (path) => rm(path, { force: true }),
    closeTerminalsForDeletion: async ({ operationKey, sessions }) => {
      const contexts = sessions.flatMap((session) => terminalContextForSession(session) ?? [])
      const terminalService = getTerminalService()
      await runWithLiveTerminalConfirmation({
        operationKey,
        purpose: 'delete-context',
        countLiveTerminals: () =>
          contexts.reduce(
            (count, context) => count + (terminalService.countLiveTerminalsForContext(context) ?? 0),
            0
          ),
        run: async () => {
          for (const context of contexts) await terminalService.closeAllForContext(context)
        }
      })
    },
    closeBrowsersForSession: (session) => closeBrowserContextForSession(session),
    withProjectLifecycleLock
  })
  return service
}

function terminalContextForSession(session: StoredSession) {
  if (session.managedContext === 'knowledge-base') return undefined
  return session.projectId
    ? ({ kind: 'project-session', sessionId: session.id } as const)
    : ({ kind: 'workspace-session', sessionId: session.id } as const)
}

function closeBrowserContextForSession(session: StoredSession): void {
  if (session.managedContext === 'knowledge-base') {
    getBrowserService().destroyKnowledgeBaseContext()
    return
  }
  getBrowserService().destroySessionContext(session.id)
}
