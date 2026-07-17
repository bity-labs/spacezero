import { app } from 'electron'
import { mkdir } from 'node:fs/promises'
import { nanoid } from 'nanoid'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { z } from 'zod'

import type { AgentUtilityProcessHost } from './agent-utility-process'
import { getWorkspaceToolRegistry } from './workspace-tool-control-plane'
import type { SessionsRepository } from '../../sessions/main/sessions.service'
import { createSessionsService } from '../../sessions/main/sessions.service'
import type { KnowledgeBaseStatus } from '../../knowledge-base/shared'
import type { WorkspaceSession } from '../../sessions/shared'
import type { AgentSessionState } from '../../../shared/agent-protocol'
import { getModelDefaults } from '../../settings/main/model-defaults-settings.service'

export const createSessionRequestSchema = z.object({
  projectId: z.string().trim().min(1),
  cwd: z.string().trim().min(1)
})

export type CreateAgentSessionHandlerDependencies = {
  repository: SessionsRepository
  utilityHost: Pick<AgentUtilityProcessHost, 'createSession' | 'deleteSession'>
  createSessionId?: () => string
  readModelDefaults?: typeof getModelDefaults
  getKnowledgeBaseStatus?: () => Promise<KnowledgeBaseStatus>
}

export type CreateWorkspaceAgentSessionHandlerDependencies = CreateAgentSessionHandlerDependencies & {
  getWorkspaceSessionCwd?: () => string
}

export type RestoreAgentSessionHandlerDependencies = {
  repository: SessionsRepository
  utilityHost: Pick<AgentUtilityProcessHost, 'createSession' | 'getState'>
  getWorkspaceSessionCwd?: () => string
  getKnowledgeBaseStatus?: () => Promise<KnowledgeBaseStatus>
}

const pendingSessionRestores = new Map<string, Promise<AgentSessionState>>()

export async function createProjectAgentSession(
  input: unknown,
  {
    repository,
    utilityHost,
    createSessionId = nanoid,
    readModelDefaults = getModelDefaults,
    getKnowledgeBaseStatus = getUnconfiguredKnowledgeBaseStatus
  }: CreateAgentSessionHandlerDependencies
): Promise<AgentSessionState> {
  const request = createSessionRequestSchema.parse(input)
  const project = await repository.findProjectById(request.projectId)
  if (!project) throw new Error('Project not found')

  const projectPath = resolve(project.path)
  if (resolve(request.cwd) !== projectPath) throw new Error('Session cwd must match the project path')

  const sessionId = createSessionId()
  const modelDefaults = await readModelDefaults()
  const knowledgeBasePath = await getAvailableProjectKnowledgeBasePath(
    project.knowledgeBasePath,
    getKnowledgeBaseStatus
  )
  const state = await utilityHost.createSession({
    sessionId,
    kind: 'project',
    projectId: request.projectId,
    cwd: projectPath,
    workspaceTools: getWorkspaceToolRegistry().listAgentDescriptors(),
    appendSystemPrompt: [createProjectKnowledgeBaseInstructions(knowledgeBasePath)],
    defaultModel: modelDefaults.defaultModel,
    thinkingLevel: modelDefaults.defaultThinking
  })

  try {
    await createSessionsService({ repository }).createProjectAgentSession({
      id: sessionId,
      projectId: request.projectId,
      transcriptPath: state.transcriptPath,
      modelProvider: state.modelProvider,
      modelId: state.modelId,
      thinkingLevel: state.thinkingLevel
    })
  } catch (error) {
    await utilityHost.deleteSession({ sessionId }).catch(() => undefined)
    throw error
  }

  return state
}

export async function restoreAgentSessionState(
  input: unknown,
  {
    repository,
    utilityHost,
    getWorkspaceSessionCwd = defaultWorkspaceSessionCwd,
    getKnowledgeBaseStatus = getUnconfiguredKnowledgeBaseStatus
  }: RestoreAgentSessionHandlerDependencies
): Promise<AgentSessionState> {
  const request = z.object({ sessionId: z.string().trim().min(1) }).parse(input)
  const pendingRestore = pendingSessionRestores.get(request.sessionId)
  if (pendingRestore) return pendingRestore

  const restore = restoreAgentSessionStateOnce(request, {
    repository,
    utilityHost,
    getWorkspaceSessionCwd,
    getKnowledgeBaseStatus
  })
  pendingSessionRestores.set(request.sessionId, restore)

  try {
    return await restore
  } finally {
    if (pendingSessionRestores.get(request.sessionId) === restore) {
      pendingSessionRestores.delete(request.sessionId)
    }
  }
}

async function restoreAgentSessionStateOnce(
  request: { sessionId: string },
  {
    repository,
    utilityHost,
    getWorkspaceSessionCwd = defaultWorkspaceSessionCwd,
    getKnowledgeBaseStatus = getUnconfiguredKnowledgeBaseStatus
  }: RestoreAgentSessionHandlerDependencies
): Promise<AgentSessionState> {
  try {
    return await utilityHost.getState(request)
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'agent.sessionNotFound') throw error
  }

  const storedSession = await repository.findSessionById(request.sessionId)
  if (!storedSession) throw new Error('agent.sessionNotFound')

  const project = storedSession.projectId
    ? resolveStoredProject(await repository.findProjectById(storedSession.projectId))
    : undefined
  const cwd = project ? resolve(project.path) : resolve(getWorkspaceSessionCwd())
  const knowledgeBasePath = project
    ? await getAvailableProjectKnowledgeBasePath(
        project.knowledgeBasePath,
        getKnowledgeBaseStatus
      )
    : null

  if (!project) await mkdir(cwd, { recursive: true })

  try {
    return await utilityHost.createSession({
      sessionId: storedSession.id,
      kind: storedSession.projectId ? 'project' : 'workspace',
      projectId: storedSession.projectId,
      cwd,
      transcriptPath: storedSession.transcriptPath ?? undefined,
      workspaceTools: getWorkspaceToolRegistry().listAgentDescriptors(),
      ...(project
        ? {
            appendSystemPrompt: [
              createProjectKnowledgeBaseInstructions(knowledgeBasePath)
            ]
          }
        : {}),
      ...(storedSession.modelProvider && storedSession.modelId
        ? {
            defaultModel: {
              providerId: storedSession.modelProvider,
              modelId: storedSession.modelId
            }
          }
        : {}),
      thinkingLevel: storedSession.thinkingLevel ?? undefined
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'agent.sessionAlreadyExists') {
      return utilityHost.getState(request)
    }
    throw error
  }
}

export async function createWorkspaceAgentSession({
  repository,
  utilityHost,
  createSessionId = nanoid,
  readModelDefaults = getModelDefaults,
  getWorkspaceSessionCwd = defaultWorkspaceSessionCwd
}: CreateWorkspaceAgentSessionHandlerDependencies): Promise<WorkspaceSession> {
  const sessionId = createSessionId()
  const cwd = resolve(getWorkspaceSessionCwd())
  await mkdir(cwd, { recursive: true })

  const modelDefaults = await readModelDefaults()
  const state = await utilityHost.createSession({
    sessionId,
    kind: 'workspace',
    projectId: null,
    cwd,
    workspaceTools: getWorkspaceToolRegistry().listAgentDescriptors(),
    defaultModel: modelDefaults.defaultModel,
    thinkingLevel: modelDefaults.defaultThinking
  })

  try {
    return await createSessionsService({ repository }).createWorkspaceAgentSession({
      id: sessionId,
      transcriptPath: state.transcriptPath,
      modelProvider: state.modelProvider,
      modelId: state.modelId,
      thinkingLevel: state.thinkingLevel
    })
  } catch (error) {
    await utilityHost.deleteSession({ sessionId }).catch(() => undefined)
    throw error
  }
}

function resolveStoredProject(
  project:
    | { id: string; path: string; knowledgeBasePath?: string | null }
    | undefined
): { id: string; path: string; knowledgeBasePath?: string | null } {
  if (!project) throw new Error('Project not found')
  return project
}

async function getAvailableProjectKnowledgeBasePath(
  knowledgeBasePath: string | null | undefined,
  getKnowledgeBaseStatus: () => Promise<KnowledgeBaseStatus>
): Promise<string | null> {
  if (!knowledgeBasePath) return null

  try {
    const status = await getKnowledgeBaseStatus()
    if (status.setupState !== 'configured') return null

    const pathFromRoot = relative(resolve(status.rootPath), resolve(knowledgeBasePath))
    if (
      pathFromRoot === '' ||
      pathFromRoot === '..' ||
      pathFromRoot.startsWith(`..${sep}`) ||
      isAbsolute(pathFromRoot)
    ) {
      return null
    }
    return knowledgeBasePath
  } catch {
    return null
  }
}

async function getUnconfiguredKnowledgeBaseStatus(): Promise<KnowledgeBaseStatus> {
  return { setupState: 'unconfigured' }
}

export function createProjectKnowledgeBaseInstructions(
  knowledgeBasePath?: string | null
): string {
  if (!knowledgeBasePath) {
    return `## Project Knowledge Base\n\nThe Project Knowledge Base is not configured. If the builder asks you to read or save durable project knowledge, clearly report that it is unavailable and direct them to set up the Knowledge Base in Space Zero. Do not pretend that knowledge was saved.`
  }

  return `## Project Knowledge Base\n\nThe durable Knowledge Base folder for this project is:\n\n${knowledgeBasePath}\n\nUse this folder when explicitly asked or when it is clearly useful for durable notes, decisions, debugging findings, handoff summaries, and user-requested project knowledge. Do not fill it with transient output or routine command logs. Read existing context before editing. When you add an important document, update the project README.md index with a useful link and description. The project source repository and this Knowledge Base folder are separate; keep source code in the project repository by default.`
}

function defaultWorkspaceSessionCwd(): string {
  return join(app.getPath('userData'), 'workspace-sessions')
}
