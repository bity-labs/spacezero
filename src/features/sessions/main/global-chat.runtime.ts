import {
  createManagedChatAgentSession,
  restoreAgentSessionState
} from '../../agent-workspace/main/agent-session-handler'
import { getDisabledGlobalSkillPaths } from '../../agent-workspace/main/agent-skill-settings.service'
import { resolveAgentSkillPaths } from '../../agent-workspace/main/agent-skill-paths'
import { getAgentUtilityProcessHost } from '../../agent-workspace/main/agent-utility-process'
import { getKnowledgeBaseService } from '../../knowledge-base/main'
import { createGlobalChatRepository } from './global-chat.repository'
import { getManagedWorktreeService } from './managed-worktree.runtime'
import { createGlobalChatService, type GlobalChatService } from './global-chat.service'
import { createSessionsRepository } from './sessions.repository'

let service: GlobalChatService | undefined

export function getGlobalChatService(): GlobalChatService {
  if (!service) {
    const chatRepository = createGlobalChatRepository()
    const sessionsRepository = createSessionsRepository()
    service = createGlobalChatService({
      getCurrentChatContext: chatRepository.getCurrentChatContext,
      listChatContexts: chatRepository.listChatContexts,
      findChatContextById: chatRepository.findChatContextById,
      createCurrentChatContext: chatRepository.createCurrentChatContext,
      setCurrentChatContext: chatRepository.setCurrentChatContext,
      clearCurrentChatContext: chatRepository.clearCurrentChatContext,
      findSessionById: sessionsRepository.findSessionById,
      getSessionState: (request) =>
        restoreAgentSessionState(request, {
          repository: sessionsRepository,
          utilityHost: getAgentUtilityProcessHost(),
          worktrees: getManagedWorktreeService(),
          getKnowledgeBaseStatus: () => getKnowledgeBaseService().getStatus(),
          readDisabledGlobalSkillPaths: getDisabledGlobalSkillPaths,
          resolveSkillPaths: resolveAgentSkillPaths
        }),
      createSession: async () => {
        const session = await createManagedChatAgentSession({
          repository: sessionsRepository,
          utilityHost: getAgentUtilityProcessHost(),
          title: 'Chat',
          managedContext: 'global-chat',
          readDisabledGlobalSkillPaths: getDisabledGlobalSkillPaths,
          resolveSkillPaths: resolveAgentSkillPaths
        })
        const stored = await sessionsRepository.findSessionById(session.id)
        if (!stored) throw new Error('Global Chat Session was not persisted.')
        return stored
      },
      deleteSession: async (sessionId) => {
        await getAgentUtilityProcessHost().deleteSession({ sessionId })
        await sessionsRepository.deleteById(sessionId)
      }
    })
  }
  return service
}
