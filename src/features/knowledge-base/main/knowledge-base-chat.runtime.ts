import {
  createWorkspaceAgentSession,
  restoreAgentSessionState
} from '../../agent-workspace/main/agent-session-handler'
import { getDisabledGlobalSkillPaths } from '../../agent-workspace/main/agent-skill-settings.service'
import { resolveAgentSkillPaths } from '../../agent-workspace/main/agent-skill-paths'
import { getAgentUtilityProcessHost } from '../../agent-workspace/main/agent-utility-process'
import { getManagedWorktreeService } from '../../sessions/main/managed-worktree.runtime'
import { createSessionsRepository } from '../../sessions/main/sessions.repository'
import { createKnowledgeBaseChatRepository } from './knowledge-base-chat.repository'
import {
  createKnowledgeBaseChatService,
  type KnowledgeBaseChatService
} from './knowledge-base-chat.service'
import { getKnowledgeBaseService } from './index'

let service: KnowledgeBaseChatService | undefined

export function getKnowledgeBaseChatService(): KnowledgeBaseChatService {
  if (!service) {
    const currentSessionRepository = createKnowledgeBaseChatRepository()
    const sessionsRepository = createSessionsRepository()
    service = createKnowledgeBaseChatService({
      getStatus: () => getKnowledgeBaseService().getStatus(),
      getCurrentChatContext: currentSessionRepository.getCurrentChatContext,
      listChatContexts: currentSessionRepository.listChatContexts,
      findChatContextById: currentSessionRepository.findChatContextById,
      createCurrentChatContext: currentSessionRepository.createCurrentChatContext,
      setCurrentChatContext: currentSessionRepository.setCurrentChatContext,
      clearCurrentChatContext: currentSessionRepository.clearCurrentChatContext,
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
        const session = await createWorkspaceAgentSession({
          repository: sessionsRepository,
          utilityHost: getAgentUtilityProcessHost(),
          title: 'Knowledge Base Chat',
          managedContext: 'knowledge-base',
          readDisabledGlobalSkillPaths: getDisabledGlobalSkillPaths,
          resolveSkillPaths: resolveAgentSkillPaths
        })
        const stored = await sessionsRepository.findSessionById(session.id)
        if (!stored) throw new Error('Knowledge Base Session was not persisted.')
        return stored
      },
      deleteSession: async (sessionId) => {
        await getAgentUtilityProcessHost()
          .deleteSession({ sessionId })
          .catch(() => undefined)
        await sessionsRepository.deleteById(sessionId)
      }
    })
  }
  return service
}
