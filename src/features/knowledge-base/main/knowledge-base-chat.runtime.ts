import { createWorkspaceAgentSession } from '../../agent-workspace/main/agent-session-handler'
import { getDisabledGlobalSkillPaths } from '../../agent-workspace/main/agent-skill-settings.service'
import { resolveAgentSkillPaths } from '../../agent-workspace/main/agent-skill-paths'
import { getAgentUtilityProcessHost } from '../../agent-workspace/main/agent-utility-process'
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
      getCurrentSessionId: currentSessionRepository.getCurrentSessionId,
      setCurrentSessionId: currentSessionRepository.setCurrentSessionId,
      clearCurrentSessionId: currentSessionRepository.clearCurrentSessionId,
      findSessionById: sessionsRepository.findSessionById,
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
