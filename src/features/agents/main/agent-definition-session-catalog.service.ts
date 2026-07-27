import { resolve } from 'node:path'

import type { ManagedWorktreeService } from '../../sessions/main/managed-worktree.service'
import type { SessionsRepository, StoredSession } from '../../sessions/main/sessions.service'
import type { AgentDefinitionCatalogEntry } from '../shared'
import { discoverGlobalAgentDefinitions } from './agent-definition-discovery'
import { resolveAgentDefinitionSourcesForSession } from './agent-definition-paths'

type StoredProject = NonNullable<Awaited<ReturnType<SessionsRepository['findProjectById']>>>

export async function listAgentDefinitionsForSession(
  sessionId: string,
  {
    repository,
    worktrees,
    discoverDefinitions = discoverGlobalAgentDefinitions,
    resolveSourcesForSession = resolveAgentDefinitionSourcesForSession
  }: {
    repository: Pick<SessionsRepository, 'findSessionById' | 'findProjectById'>
    worktrees?: Pick<ManagedWorktreeService, 'validate'>
    discoverDefinitions?: typeof discoverGlobalAgentDefinitions
    resolveSourcesForSession?: typeof resolveAgentDefinitionSourcesForSession
  }
): Promise<AgentDefinitionCatalogEntry[]> {
  const storedSession = await repository.findSessionById(sessionId.trim())
  if (!storedSession || storedSession.archivedAt) throw new Error('agent.sessionNotFound')

  const project = storedSession.projectId
    ? await repository.findProjectById(storedSession.projectId)
    : undefined
  const projectTrusted = project?.agentResourcesTrusted === true && !project.archivedAt
  const cwd = project
    ? await resolveTrustedProjectSessionCwd(storedSession, project, worktrees)
    : undefined

  const sources = await resolveSourcesForSession({
    cwd: cwd ?? process.cwd(),
    kind: project ? 'project' : 'workspace',
    projectTrusted: Boolean(cwd && projectTrusted)
  })
  return discoverDefinitions({ sources })
}

async function resolveTrustedProjectSessionCwd(
  session: StoredSession,
  project: StoredProject,
  worktrees?: Pick<ManagedWorktreeService, 'validate'>
): Promise<string | undefined> {
  if (project.archivedAt || project.agentResourcesTrusted !== true) return undefined

  const projectPath = resolve(project.path)
  const worktreeValues = [session.worktreePath, session.worktreeBranch, session.worktreeBaseRevision]
  if (worktreeValues.every((value) => !value)) return projectPath
  if (!session.worktreePath || !session.worktreeBranch || !session.worktreeBaseRevision || !worktrees) {
    return undefined
  }

  const worktree = {
    path: resolve(session.worktreePath),
    branch: session.worktreeBranch,
    baseRevision: session.worktreeBaseRevision
  }
  const valid = await worktrees.validate({
    projectPath,
    projectId: project.id,
    sessionId: session.id,
    worktree
  })
  return valid ? worktree.path : undefined
}
