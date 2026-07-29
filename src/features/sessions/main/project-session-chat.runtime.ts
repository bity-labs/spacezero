import { createProjectChatAgentSession } from '../../agent-workspace/main/agent-session-handler'
import { getDisabledGlobalSkillPaths } from '../../agent-workspace/main/agent-skill-settings.service'
import { resolveAgentSkillPaths } from '../../agent-workspace/main/agent-skill-paths'
import { getAgentUtilityProcessHost } from '../../agent-workspace/main/agent-utility-process'
import { getKnowledgeBaseRootProvider, getKnowledgeBaseService } from '../../knowledge-base/main'
import { getManagedWorktreeService } from './managed-worktree.runtime'
import { createProjectSessionChatRepository } from './project-session-chat.repository'
import {
  createProjectSessionChatService,
  type ProjectSessionChatService
} from './project-session-chat.service'
import { createSessionsRepository } from './sessions.repository'

let service: ProjectSessionChatService | undefined

async function getVerifiedKnowledgeBaseStatus() {
  const status = await getKnowledgeBaseService().getStatus()
  if (status.setupState !== 'configured') return status
  return { ...status, rootPath: await getKnowledgeBaseRootProvider().getVerifiedRoot() }
}

export function getProjectSessionChatService(): ProjectSessionChatService {
  if (!service) {
    const chatRepository = createProjectSessionChatRepository()
    const sessionsRepository = createSessionsRepository()
    service = createProjectSessionChatService({
      findSessionById: sessionsRepository.findSessionById,
      getCurrentChatContext: chatRepository.getCurrentChatContext,
      listChatContexts: chatRepository.listChatContexts,
      findChatContextById: chatRepository.findChatContextById,
      createCurrentChatContext: chatRepository.createCurrentChatContext,
      setCurrentChatContext: chatRepository.setCurrentChatContext,
      createFreshAgentSession: (projectSessionId) =>
        createProjectChatAgentSession(projectSessionId, {
          repository: sessionsRepository,
          utilityHost: getAgentUtilityProcessHost(),
          worktrees: getManagedWorktreeService(),
          getKnowledgeBaseStatus: getVerifiedKnowledgeBaseStatus,
          readDisabledGlobalSkillPaths: getDisabledGlobalSkillPaths,
          resolveSkillPaths: resolveAgentSkillPaths
        }),
      deleteAgentSession: async (agentSessionId) => {
        await getAgentUtilityProcessHost().deleteSession({ sessionId: agentSessionId })
        await sessionsRepository.deleteById(agentSessionId)
      },
      getSessionState: (request) => getAgentUtilityProcessHost().getState(request)
    })
  }
  return service
}
