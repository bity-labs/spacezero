import { app } from 'electron'
import { mkdir } from 'node:fs/promises'
import { nanoid } from 'nanoid'
import { join, resolve } from 'node:path'
import { z } from 'zod'

import type { AgentUtilityProcessHost } from './agent-utility-process'
import { getWorkspaceToolRegistry } from './workspace-tool-control-plane'
import type { SessionsRepository } from '../../sessions/main/sessions.service'
import { createSessionsService } from '../../sessions/main/sessions.service'
import type { WorkspaceSession } from '../../sessions/shared'
import type { AgentSessionKind, AgentSessionState } from '../../../shared/agent-protocol'
import type { AgentSkillPath } from '../shared/agent-skill.model'
import { getDisabledGlobalSkillPaths } from './agent-skill-settings.service'
import { getModelDefaults } from '../../settings/main/model-defaults-settings.service'

export const createSessionRequestSchema = z.object({
  projectId: z.string().trim().min(1),
  cwd: z.string().trim().min(1)
})

type ReadProjectTrust = (projectId: string, projectPath: string) => Promise<boolean>
type ResolveSkillPaths = (
  cwd: string,
  kind: AgentSessionKind,
  projectTrusted?: boolean
) => Promise<AgentSkillPath[]>

export type CreateAgentSessionHandlerDependencies = {
  repository: SessionsRepository
  utilityHost: Pick<AgentUtilityProcessHost, 'createSession' | 'deleteSession'>
  createSessionId?: () => string
  readModelDefaults?: typeof getModelDefaults
  readDisabledGlobalSkillPaths?: typeof getDisabledGlobalSkillPaths
  readProjectTrust?: ReadProjectTrust
  resolveSkillPaths?: ResolveSkillPaths
}

export type CreateWorkspaceAgentSessionHandlerDependencies = CreateAgentSessionHandlerDependencies & {
  getWorkspaceSessionCwd?: () => string
}

export type RestoreAgentSessionHandlerDependencies = {
  repository: SessionsRepository
  utilityHost: Pick<AgentUtilityProcessHost, 'createSession' | 'getState'>
  getWorkspaceSessionCwd?: () => string
  readDisabledGlobalSkillPaths?: typeof getDisabledGlobalSkillPaths
  readProjectTrust?: ReadProjectTrust
  resolveSkillPaths?: ResolveSkillPaths
}

const pendingSessionRestores = new Map<string, Promise<AgentSessionState>>()
const noDisabledGlobalSkillPaths: typeof getDisabledGlobalSkillPaths = async () => []
// Project-local resources fail closed until a main-owned persisted trust decision is integrated.
const denyProjectTrustWithoutPersistedDecision: ReadProjectTrust = async () => false

export async function createProjectAgentSession(
  input: unknown,
  {
    repository,
    utilityHost,
    createSessionId = nanoid,
    readModelDefaults = getModelDefaults,
    readDisabledGlobalSkillPaths = noDisabledGlobalSkillPaths,
    readProjectTrust = denyProjectTrustWithoutPersistedDecision,
    resolveSkillPaths
  }: CreateAgentSessionHandlerDependencies
): Promise<AgentSessionState> {
  const request = createSessionRequestSchema.parse(input)
  const project = await repository.findProjectById(request.projectId)
  if (!project) throw new Error('Project not found')

  const projectPath = resolve(project.path)
  if (resolve(request.cwd) !== projectPath) throw new Error('Session cwd must match the project path')

  const sessionId = createSessionId()
  const modelDefaults = await readModelDefaults()
  const disabledGlobalSkillPaths = await readDisabledGlobalSkillPaths()
  const projectTrusted = await readProjectTrust(request.projectId, projectPath)
  const skillPaths = await resolveSessionSkillPaths(
    resolveSkillPaths,
    projectPath,
    'project',
    projectTrusted
  )
  const state = await utilityHost.createSession({
    sessionId,
    kind: 'project',
    projectId: request.projectId,
    cwd: projectPath,
    workspaceTools: getWorkspaceToolRegistry().listAgentDescriptors(),
    ...(skillPaths ? { skillPaths } : {}),
    ...(disabledGlobalSkillPaths.length > 0 ? { disabledGlobalSkillPaths } : {}),
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
    readDisabledGlobalSkillPaths = noDisabledGlobalSkillPaths,
    readProjectTrust = denyProjectTrustWithoutPersistedDecision,
    resolveSkillPaths
  }: RestoreAgentSessionHandlerDependencies
): Promise<AgentSessionState> {
  const request = z.object({ sessionId: z.string().trim().min(1) }).parse(input)
  const pendingRestore = pendingSessionRestores.get(request.sessionId)
  if (pendingRestore) return pendingRestore

  const restore = restoreAgentSessionStateOnce(request, {
    repository,
    utilityHost,
    getWorkspaceSessionCwd,
    readDisabledGlobalSkillPaths,
    readProjectTrust,
    resolveSkillPaths
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
    readDisabledGlobalSkillPaths = noDisabledGlobalSkillPaths,
    readProjectTrust = denyProjectTrustWithoutPersistedDecision,
    resolveSkillPaths
  }: RestoreAgentSessionHandlerDependencies
): Promise<AgentSessionState> {
  try {
    return await utilityHost.getState(request)
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'agent.sessionNotFound') throw error
  }

  const storedSession = await repository.findSessionById(request.sessionId)
  if (!storedSession) throw new Error('agent.sessionNotFound')

  const disabledGlobalSkillPaths = await readDisabledGlobalSkillPaths()
  const cwd = storedSession.projectId
    ? resolveStoredProjectPath(await repository.findProjectById(storedSession.projectId))
    : resolve(getWorkspaceSessionCwd())
  const projectTrusted = storedSession.projectId
    ? await readProjectTrust(storedSession.projectId, cwd)
    : false
  const skillPaths = await resolveSessionSkillPaths(
    resolveSkillPaths,
    cwd,
    storedSession.projectId ? 'project' : 'workspace',
    projectTrusted
  )

  if (!storedSession.projectId) await mkdir(cwd, { recursive: true })

  try {
    return await utilityHost.createSession({
      sessionId: storedSession.id,
      kind: storedSession.projectId ? 'project' : 'workspace',
      projectId: storedSession.projectId,
      cwd,
      transcriptPath: storedSession.transcriptPath ?? undefined,
      workspaceTools: getWorkspaceToolRegistry().listAgentDescriptors(),
      ...(skillPaths ? { skillPaths } : {}),
      ...(disabledGlobalSkillPaths.length > 0 ? { disabledGlobalSkillPaths } : {}),
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
  getWorkspaceSessionCwd = defaultWorkspaceSessionCwd,
  readDisabledGlobalSkillPaths = noDisabledGlobalSkillPaths,
  resolveSkillPaths
}: CreateWorkspaceAgentSessionHandlerDependencies): Promise<WorkspaceSession> {
  const sessionId = createSessionId()
  const cwd = resolve(getWorkspaceSessionCwd())
  await mkdir(cwd, { recursive: true })

  const modelDefaults = await readModelDefaults()
  const disabledGlobalSkillPaths = await readDisabledGlobalSkillPaths()
  const skillPaths = await resolveSessionSkillPaths(resolveSkillPaths, cwd, 'workspace', false)
  const state = await utilityHost.createSession({
    sessionId,
    kind: 'workspace',
    projectId: null,
    cwd,
    workspaceTools: getWorkspaceToolRegistry().listAgentDescriptors(),
    ...(skillPaths ? { skillPaths } : {}),
    ...(disabledGlobalSkillPaths.length > 0 ? { disabledGlobalSkillPaths } : {}),
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

async function resolveSessionSkillPaths(
  resolveSkillPaths: ResolveSkillPaths | undefined,
  cwd: string,
  kind: AgentSessionKind,
  projectTrusted: boolean
): Promise<AgentSkillPath[] | undefined> {
  if (!resolveSkillPaths) return undefined

  const skillPaths = await resolveSkillPaths(cwd, kind, projectTrusted)
  return projectTrusted
    ? skillPaths
    : skillPaths.filter((skillPath) => skillPath.scope !== 'project')
}

function resolveStoredProjectPath(project: { id: string; path: string } | undefined): string {
  if (!project) throw new Error('Project not found')
  return resolve(project.path)
}

function defaultWorkspaceSessionCwd(): string {
  return join(app.getPath('userData'), 'workspace-sessions')
}
