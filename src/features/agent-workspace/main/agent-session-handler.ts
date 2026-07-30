import { app } from 'electron'
import { mkdir } from 'node:fs/promises'
import { nanoid } from 'nanoid'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { z } from 'zod'

import type { AgentUtilityProcessHost } from './agent-utility-process'
import { listWorkspaceToolDescriptorsForSession } from './workspace-tool-control-plane'
import {
  withProjectLifecycleLock as runWithProjectLifecycleLock,
  type ProjectLifecycleLock
} from '../../projects/main/project-lifecycle-lock'
import type { Clock, SessionsRepository, StoredSession } from '../../sessions/main/sessions.service'
import {
  createSessionsService,
  toManagedChatAgentSession
} from '../../sessions/main/sessions.service'
import type { KnowledgeBaseStatus } from '../../knowledge-base/shared'
import type {
  ProjectSession,
  SessionGitHubSource,
  ManagedChatAgentSession
} from '../../sessions/shared'
import type {
  ManagedWorktreeService,
  ManagedWorktreeStartPoint
} from '../../sessions/main/managed-worktree.service'
import type {
  AgentDefinitionReference,
  AgentSessionKind,
  AgentSessionState,
  DelegationAgentDefinition,
  ApplyAgentDefinitionToFreshSessionRequest,
  ResolvedAgentDefinition
} from '../../../shared/agent-protocol'
import type { AgentSkillPath } from '../shared/agent-skill.model'
import { getDisabledGlobalSkillPaths } from './agent-skill-settings.service'
import { defaultModelSettingSchema, thinkingLevelSchema } from '../../../shared/model-settings'
import { getModelDefaults } from '../../settings/main/model-defaults-settings.service'
import {
  resolveAgentDefinitionForSession,
  resolveAgentDefinitionsForDelegation,
  type ResolveAgentDefinitionForSession,
  type ResolveAgentDefinitionsForDelegation
} from '../../agents/main/agent-definition-resolver'
import { resolveAgentDefinitionSourcesForSession } from '../../agents/main/agent-definition-paths'

const agentDefinitionReferenceSchema = z.object({
  id: z.string().trim().min(1)
})
const AGENT_SESSION_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/

const agentDefinitionSpawnsSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }).strict(),
  z.object({ type: z.literal('any') }).strict(),
  z
    .object({
      type: z.literal('list'),
      definitions: z.array(z.string().trim().min(1))
    })
    .strict()
])

const agentDefinitionSnapshotSchema = z
  .object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    body: z.string(),
    model: defaultModelSettingSchema.optional(),
    thinkingLevel: thinkingLevelSchema.optional(),
    tools: z.array(z.string().trim().min(1)).optional(),
    spawns: agentDefinitionSpawnsSchema.optional()
  })
  .strict()

export const createSessionRequestSchema = z.object({
  projectId: z.string().trim().min(1),
  cwd: z.string().trim().min(1),
  agentDefinition: agentDefinitionReferenceSchema.optional()
})

const applyAgentDefinitionToFreshSessionSchema = z.object({
  sessionId: z.string().trim().min(1),
  agentDefinition: agentDefinitionReferenceSchema
})

type ReadProjectTrust = (projectId: string, projectPath: string) => Promise<boolean>
type ResolveSkillPaths = (
  cwd: string,
  kind: AgentSessionKind,
  projectTrusted?: boolean
) => Promise<AgentSkillPath[]>

type StoredProject = {
  id: string
  path: string
  knowledgeBasePath?: string | null
  archivedAt?: Date | null
  agentResourcesTrusted?: boolean | null
}

export type CreateAgentSessionHandlerDependencies = {
  repository: SessionsRepository
  utilityHost: Pick<AgentUtilityProcessHost, 'createSession' | 'deleteSession'>
  worktrees: Pick<ManagedWorktreeService, 'create' | 'remove'>
  createSessionId?: () => string
  withProjectLifecycleLock?: ProjectLifecycleLock
  resolveProjectPathForSession?: (path: string) => string
  readModelDefaults?: typeof getModelDefaults
  getKnowledgeBaseStatus?: () => Promise<KnowledgeBaseStatus>
  readDisabledGlobalSkillPaths?: typeof getDisabledGlobalSkillPaths
  readProjectTrust?: ReadProjectTrust
  resolveSkillPaths?: ResolveSkillPaths
  resolveAgentDefinition?: ResolveAgentDefinitionForSession
  resolveDelegationDefinitions?: ResolveAgentDefinitionsForDelegation
  resolveAgentDefinitionSources?: typeof resolveAgentDefinitionSourcesForSession
}

export type CreateManagedChatAgentSessionHandlerDependencies = Omit<
  CreateAgentSessionHandlerDependencies,
  'worktrees'
> & {
  getManagedChatCwd?: () => string
  title: string
  managedContext: 'knowledge-base' | 'global-chat'
  agentDefinition?: AgentDefinitionReference
}

export type CreateProjectChatAgentSessionDependencies = {
  repository: SessionsRepository
  utilityHost: Pick<AgentUtilityProcessHost, 'createSession' | 'deleteSession'>
  worktrees: Pick<ManagedWorktreeService, 'validate'>
  createSessionId?: () => string
  readModelDefaults?: typeof getModelDefaults
  getKnowledgeBaseStatus?: () => Promise<KnowledgeBaseStatus>
  readDisabledGlobalSkillPaths?: typeof getDisabledGlobalSkillPaths
  readProjectTrust?: ReadProjectTrust
  resolveSkillPaths?: ResolveSkillPaths
  resolveDelegationDefinitions?: ResolveAgentDefinitionsForDelegation
  resolveAgentDefinitionSources?: typeof resolveAgentDefinitionSourcesForSession
  withProjectLifecycleLock?: ProjectLifecycleLock
  now?: Clock
}

export type RestoreAgentSessionHandlerDependencies = {
  repository: SessionsRepository
  utilityHost: Pick<AgentUtilityProcessHost, 'createSession' | 'getState'>
  worktrees?: Pick<ManagedWorktreeService, 'validate'>
  getManagedChatCwd?: () => string
  getKnowledgeBaseStatus?: () => Promise<KnowledgeBaseStatus>
  readDisabledGlobalSkillPaths?: typeof getDisabledGlobalSkillPaths
  readProjectTrust?: ReadProjectTrust
  resolveSkillPaths?: ResolveSkillPaths
  resolveDelegationDefinitions?: ResolveAgentDefinitionsForDelegation
  resolveAgentDefinitionSources?: typeof resolveAgentDefinitionSourcesForSession
}

export type ApplyAgentDefinitionToFreshSessionDependencies = Omit<
  RestoreAgentSessionHandlerDependencies,
  'utilityHost'
> & {
  utilityHost: Pick<AgentUtilityProcessHost, 'createSession' | 'deleteSession' | 'getState'>
  readModelDefaults?: typeof getModelDefaults
  resolveAgentDefinition?: ResolveAgentDefinitionForSession
  resolveAgentDefinitionSources?: typeof resolveAgentDefinitionSourcesForSession
  now?: Clock
}

const pendingSessionRestores = new Map<string, Promise<AgentSessionState>>()
const noDisabledGlobalSkillPaths: typeof getDisabledGlobalSkillPaths = async () => []
const unavailableStoredWorktrees = { validate: async () => false }

export type CreateManagedProjectAgentSessionRequest = {
  projectId: string
  expectedProjectPath?: string
  title?: string
  source?: SessionGitHubSource
  systemPromptContext?: string
  startPoint?: ManagedWorktreeStartPoint
  agentDefinition?: AgentDefinitionReference
}

export async function createProjectAgentSession(
  input: unknown,
  dependencies: CreateAgentSessionHandlerDependencies
): Promise<AgentSessionState> {
  const request = createSessionRequestSchema.parse(input)
  return (
    await createManagedProjectAgentSession(
      {
        projectId: request.projectId,
        expectedProjectPath: request.cwd,
        ...(request.agentDefinition ? { agentDefinition: request.agentDefinition } : {})
      },
      dependencies
    )
  ).state
}

export async function createManagedProjectAgentSession(
  request: CreateManagedProjectAgentSessionRequest,
  {
    repository,
    utilityHost,
    worktrees,
    createSessionId = nanoid,
    withProjectLifecycleLock = runWithProjectLifecycleLock,
    resolveProjectPathForSession = (path) => resolve(path),
    readModelDefaults = getModelDefaults,
    getKnowledgeBaseStatus = getUnconfiguredKnowledgeBaseStatus,
    readDisabledGlobalSkillPaths = noDisabledGlobalSkillPaths,
    readProjectTrust,
    resolveSkillPaths,
    resolveAgentDefinition = resolveAgentDefinitionForSession,
    resolveDelegationDefinitions = resolveAgentDefinitionsForDelegation,
    resolveAgentDefinitionSources = resolveAgentDefinitionSourcesForSession
  }: CreateAgentSessionHandlerDependencies
): Promise<{ state: AgentSessionState; session: ProjectSession }> {
  const projectId = request.projectId.trim()
  return withProjectLifecycleLock(projectId, async () => {
    let project = await repository.findProjectById(projectId)
    if (!project) throw new Error('Project not found')
    if (project.archivedAt) throw new Error('Project is archived')
    if (
      request.expectedProjectPath &&
      !samePath(request.expectedProjectPath, project.path) &&
      !samePath(resolveProjectPathForSession(request.expectedProjectPath), project.path)
    ) {
      throw new Error('Session cwd must match the project path')
    }

    const preparedProjectPath = resolveProjectPathForSession(project.path)
    if (!samePath(preparedProjectPath, project.path)) {
      await repository.updateProjectPath(projectId, preparedProjectPath)
      project = { ...project, path: preparedProjectPath }
    }
    const projectPath = resolve(project.path)
    const sessionId = createSessionId()
    const worktree = await worktrees.create({
      projectPath,
      projectId,
      sessionId,
      source: request.source,
      startPoint: request.startPoint
    })
    let state: AgentSessionState | undefined
    let agentDefinitionSnapshot: ResolvedAgentDefinition | undefined
    const persistSession = () =>
      createSessionsService({ repository }).createProjectAgentSession({
        id: sessionId,
        projectId,
        title: request.title,
        worktree,
        source: request.source,
        transcriptPath: state?.transcriptPath,
        modelProvider: state?.modelProvider,
        modelId: state?.modelId,
        thinkingLevel: state?.thinkingLevel,
        agentDefinitionSnapshot
      })

    try {
      const modelDefaults = await readModelDefaults()
      const knowledgeBasePath = await getAvailableProjectKnowledgeBasePath(
        project.knowledgeBasePath,
        getKnowledgeBaseStatus
      )
      const disabledGlobalSkillPaths = await readDisabledGlobalSkillPaths()
      const projectTrusted = await readProjectTrustForProject(project, readProjectTrust)
      const skillPaths = await resolveSessionSkillPaths(
        resolveSkillPaths,
        worktree.path,
        'project',
        projectTrusted
      )
      const agentDefinitionSources = await resolveAgentDefinitionSources({
        cwd: worktree.path,
        kind: 'project',
        projectTrusted
      })
      agentDefinitionSnapshot = request.agentDefinition
        ? await resolveAgentDefinition(request.agentDefinition, { sources: agentDefinitionSources })
        : undefined
      const delegationDefinitions = await resolveVisibleDelegationDefinitions(
        resolveDelegationDefinitions,
        agentDefinitionSources
      )
      state = await utilityHost.createSession({
        sessionId,
        kind: 'project',
        projectId,
        cwd: worktree.path,
        workspaceTools: listWorkspaceToolDescriptorsForSession({ kind: 'project' }),
        appendSystemPrompt: [createProjectKnowledgeBaseInstructions(knowledgeBasePath)],
        ...(skillPaths ? { skillPaths } : {}),
        ...(disabledGlobalSkillPaths.length > 0 ? { disabledGlobalSkillPaths } : {}),
        ...(request.systemPromptContext
          ? { systemPromptContext: request.systemPromptContext }
          : {}),
        defaultModel: modelDefaults.defaultModel,
        thinkingLevel: modelDefaults.defaultThinking,
        ...(agentDefinitionSnapshot ? { agentDefinition: agentDefinitionSnapshot } : {}),
        ...createDelegationDefinitionsRequest(delegationDefinitions)
      })

      const session = await persistSession()
      return { state, session }
    } catch (error) {
      const cleanupFailures: unknown[] = []
      let utilityCleanupFailed = false

      if (state) {
        try {
          await utilityHost.deleteSession({ sessionId })
        } catch (cleanupError) {
          utilityCleanupFailed = true
          cleanupFailures.push(cleanupError)
        }
      }

      // A live utility Session may still be using the worktree, so do not remove its cwd.
      if (!utilityCleanupFailed) {
        try {
          await worktrees.remove({ projectPath, projectId, sessionId, worktree })
        } catch (cleanupError) {
          cleanupFailures.push(cleanupError)
        }
      }

      if (cleanupFailures.length === 0) throw error

      try {
        const existing = await repository.findSessionById(sessionId)
        if (!existing) await persistSession()
      } catch (recoveryError) {
        cleanupFailures.push(recoveryError)
      }

      const rollbackError = new Error('session.creationRollbackFailed', { cause: error })
      Object.defineProperty(rollbackError, 'cleanupFailures', {
        value: [...cleanupFailures],
        enumerable: false
      })
      throw rollbackError
    }
  })
}

export async function createProjectChatAgentSession(
  projectSessionId: string,
  {
    repository,
    utilityHost,
    worktrees,
    createSessionId = nanoid,
    readModelDefaults = getModelDefaults,
    getKnowledgeBaseStatus = getUnconfiguredKnowledgeBaseStatus,
    readDisabledGlobalSkillPaths = noDisabledGlobalSkillPaths,
    readProjectTrust,
    resolveSkillPaths,
    resolveDelegationDefinitions = resolveAgentDefinitionsForDelegation,
    resolveAgentDefinitionSources = resolveAgentDefinitionSourcesForSession,
    withProjectLifecycleLock = runWithProjectLifecycleLock,
    now = () => new Date()
  }: CreateProjectChatAgentSessionDependencies
): Promise<StoredSession> {
  const normalizedProjectSessionId = projectSessionId.trim()
  const candidate = await repository.findSessionById(normalizedProjectSessionId)
  if (!candidate?.projectId || candidate.archivedAt || candidate.workspaceContextSessionId) {
    throw new Error('Project Session not found')
  }

  return withProjectLifecycleLock(candidate.projectId, async () => {
    const owner = await repository.findSessionById(normalizedProjectSessionId)
    if (!owner?.projectId || owner.archivedAt || owner.workspaceContextSessionId) {
      throw new Error('Project Session not found')
    }
    const project = resolveStoredProject(await repository.findProjectById(owner.projectId))
    if (project.archivedAt) throw new Error('Project is archived')

    const cwd = await resolveStoredProjectSessionCwd(owner, project, worktrees)
    const knowledgeBasePath = await getAvailableProjectKnowledgeBasePath(
      project.knowledgeBasePath,
      getKnowledgeBaseStatus
    )
    const disabledGlobalSkillPaths = await readDisabledGlobalSkillPaths()
    const projectTrusted = await readProjectTrustForProject(project, readProjectTrust)
    const skillPaths = await resolveSessionSkillPaths(
      resolveSkillPaths,
      cwd,
      'project',
      projectTrusted
    )
    const agentDefinitionSources = await resolveAgentDefinitionSources({
      cwd,
      kind: 'project',
      projectTrusted
    })
    const delegationDefinitions = await resolveVisibleDelegationDefinitions(
      resolveDelegationDefinitions,
      agentDefinitionSources
    )
    const modelDefaults = await readModelDefaults()
    const sourceContext = createStoredSourceContext(owner)
    const sessionId = createSessionId()
    const state = await utilityHost.createSession({
      sessionId,
      kind: 'project',
      projectId: owner.projectId,
      cwd,
      workspaceTools: listWorkspaceToolDescriptorsForSession({ kind: 'project' }),
      appendSystemPrompt: [createProjectKnowledgeBaseInstructions(knowledgeBasePath)],
      ...(skillPaths ? { skillPaths } : {}),
      ...(disabledGlobalSkillPaths.length > 0 ? { disabledGlobalSkillPaths } : {}),
      ...(sourceContext ? { systemPromptContext: sourceContext } : {}),
      defaultModel: modelDefaults.defaultModel,
      thinkingLevel: modelDefaults.defaultThinking,
      ...createDelegationDefinitionsRequest(delegationDefinitions)
    })

    const timestamp = now()
    const storedSession: StoredSession = {
      id: sessionId,
      projectId: owner.projectId,
      title: owner.title,
      status: 'idle',
      createdAt: timestamp,
      updatedAt: timestamp,
      transcriptPath: state.transcriptPath,
      modelProvider: state.modelProvider,
      modelId: state.modelId,
      thinkingLevel: state.thinkingLevel,
      workspaceContextSessionId: owner.id
    }
    try {
      return await repository.create(storedSession)
    } catch (error) {
      try {
        await utilityHost.deleteSession({ sessionId })
      } catch (cleanupError) {
        const cleanupFailures: unknown[] = [cleanupError]
        try {
          const existing = await repository.findSessionById(sessionId)
          if (!existing) await repository.create(storedSession)
        } catch (recoveryError) {
          cleanupFailures.push(recoveryError)
        }

        const rollbackError = new Error('session.creationRollbackFailed', { cause: error })
        Object.defineProperty(rollbackError, 'cleanupFailures', {
          value: cleanupFailures,
          enumerable: false
        })
        throw rollbackError
      }
      throw error
    }
  })
}

export async function applyAgentDefinitionToFreshSession(
  input: unknown,
  {
    repository,
    utilityHost,
    worktrees = unavailableStoredWorktrees,
    getManagedChatCwd = defaultManagedChatCwd,
    getKnowledgeBaseStatus = getUnconfiguredKnowledgeBaseStatus,
    readDisabledGlobalSkillPaths = noDisabledGlobalSkillPaths,
    readProjectTrust,
    resolveSkillPaths,
    readModelDefaults = getModelDefaults,
    resolveAgentDefinition = resolveAgentDefinitionForSession,
    resolveAgentDefinitionSources = resolveAgentDefinitionSourcesForSession,
    now = () => new Date()
  }: ApplyAgentDefinitionToFreshSessionDependencies
): Promise<AgentSessionState> {
  const request = applyAgentDefinitionToFreshSessionSchema.parse(
    input
  ) satisfies ApplyAgentDefinitionToFreshSessionRequest
  const storedSession = await repository.findSessionById(request.sessionId)
  if (!storedSession || storedSession.archivedAt) throw new Error('agent.sessionNotFound')

  const currentState = await restoreAgentSessionState(
    { sessionId: request.sessionId },
    {
      repository,
      utilityHost,
      worktrees,
      getManagedChatCwd,
      getKnowledgeBaseStatus,
      readDisabledGlobalSkillPaths,
      readProjectTrust,
      resolveSkillPaths
    }
  )
  if (
    currentState.status !== 'idle' ||
    currentState.agentDefinition ||
    storedSession.agentDefinitionSnapshot ||
    (currentState.transcriptSnapshot?.length ?? 0) > 0
  ) {
    throw new Error('agentDefinitions.sessionNotFresh')
  }

  const modelDefaults = await readModelDefaults()
  const workspaceSession = await resolveWorkspaceContextSession(storedSession, repository)
  const project = workspaceSession.projectId
    ? resolveStoredProject(await repository.findProjectById(workspaceSession.projectId))
    : undefined
  const cwd = project
    ? await resolveStoredProjectSessionCwd(workspaceSession, project, worktrees)
    : resolve(getManagedChatCwd())
  const knowledgeBasePath = project
    ? await getAvailableProjectKnowledgeBasePath(project.knowledgeBasePath, getKnowledgeBaseStatus)
    : null
  const disabledGlobalSkillPaths = await readDisabledGlobalSkillPaths()
  const projectTrusted = project
    ? await readProjectTrustForProject(project, readProjectTrust)
    : false
  const skillPaths = await resolveSessionSkillPaths(
    resolveSkillPaths,
    cwd,
    workspaceSession.projectId ? 'project' : 'workspace',
    projectTrusted
  )
  const sourceContext = createStoredSourceContext(workspaceSession)
  const agentDefinitionSources = await resolveAgentDefinitionSources({
    cwd,
    kind: workspaceSession.projectId ? 'project' : 'workspace',
    projectTrusted
  })
  const agentDefinition = await resolveAgentDefinition(request.agentDefinition, {
    sources: agentDefinitionSources
  })

  if (!project) await mkdir(cwd, { recursive: true })

  const baseCreateRequest = {
    sessionId: storedSession.id,
    kind: workspaceSession.projectId ? ('project' as const) : ('workspace' as const),
    projectId: workspaceSession.projectId,
    cwd,
    transcriptPath: storedSession.transcriptPath ?? currentState.transcriptPath ?? undefined,
    workspaceTools: listWorkspaceToolDescriptorsForSession({
      kind: workspaceSession.projectId ? 'project' : 'workspace',
      managedContext: storedSession.managedContext
    }),
    ...(project
      ? {
          appendSystemPrompt: [createProjectKnowledgeBaseInstructions(knowledgeBasePath)]
        }
      : {}),
    ...(skillPaths ? { skillPaths } : {}),
    ...(disabledGlobalSkillPaths.length > 0 ? { disabledGlobalSkillPaths } : {}),
    ...(sourceContext ? { systemPromptContext: sourceContext } : {}),
    ...(storedSession.modelProvider && storedSession.modelId
      ? {
          defaultModel: {
            providerId: storedSession.modelProvider,
            modelId: storedSession.modelId
          }
        }
      : {
          defaultModel: modelDefaults.defaultModel
        }),
    thinkingLevel: storedSession.thinkingLevel ?? modelDefaults.defaultThinking
  }

  await utilityHost.deleteSession({ sessionId: request.sessionId })
  let definitionSessionCreated = false
  try {
    const nextState = await utilityHost.createSession({
      ...baseCreateRequest,
      agentDefinition
    })
    definitionSessionCreated = true
    await repository.update({
      ...storedSession,
      transcriptPath: nextState.transcriptPath,
      modelProvider: nextState.modelProvider,
      modelId: nextState.modelId,
      thinkingLevel: nextState.thinkingLevel,
      agentDefinitionSnapshot: JSON.stringify(agentDefinition),
      updatedAt: now()
    })
    return nextState
  } catch (error) {
    const rollbackFailures: unknown[] = []

    if (definitionSessionCreated) {
      try {
        await utilityHost.deleteSession({ sessionId: request.sessionId })
      } catch (rollbackError) {
        rollbackFailures.push(rollbackError)
      }
    }

    try {
      await utilityHost.createSession(baseCreateRequest)
    } catch (rollbackError) {
      rollbackFailures.push(rollbackError)
    }

    if (rollbackFailures.length > 0) {
      const rollbackError = new Error('agentDefinitions.applyRollbackFailed', { cause: error })
      Object.defineProperty(rollbackError, 'rollbackFailures', {
        value: rollbackFailures,
        enumerable: false
      })
      throw rollbackError
    }

    throw error
  }
}

export async function restoreAgentSessionState(
  input: unknown,
  {
    repository,
    utilityHost,
    worktrees = unavailableStoredWorktrees,
    getManagedChatCwd = defaultManagedChatCwd,
    getKnowledgeBaseStatus = getUnconfiguredKnowledgeBaseStatus,
    readDisabledGlobalSkillPaths = noDisabledGlobalSkillPaths,
    readProjectTrust,
    resolveSkillPaths,
    resolveDelegationDefinitions = resolveAgentDefinitionsForDelegation,
    resolveAgentDefinitionSources = resolveAgentDefinitionSourcesForSession
  }: RestoreAgentSessionHandlerDependencies
): Promise<AgentSessionState> {
  const request = z.object({ sessionId: z.string().trim().min(1) }).parse(input)
  const pendingRestore = pendingSessionRestores.get(request.sessionId)
  if (pendingRestore) return pendingRestore

  const restore = restoreAgentSessionStateOnce(request, {
    repository,
    utilityHost,
    worktrees,
    getManagedChatCwd,
    getKnowledgeBaseStatus,
    readDisabledGlobalSkillPaths,
    readProjectTrust,
    resolveSkillPaths,
    resolveDelegationDefinitions,
    resolveAgentDefinitionSources
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
    worktrees = unavailableStoredWorktrees,
    getManagedChatCwd = defaultManagedChatCwd,
    getKnowledgeBaseStatus = getUnconfiguredKnowledgeBaseStatus,
    readDisabledGlobalSkillPaths = noDisabledGlobalSkillPaths,
    readProjectTrust,
    resolveSkillPaths,
    resolveDelegationDefinitions = resolveAgentDefinitionsForDelegation,
    resolveAgentDefinitionSources = resolveAgentDefinitionSourcesForSession
  }: RestoreAgentSessionHandlerDependencies
): Promise<AgentSessionState> {
  try {
    return await utilityHost.getState(request)
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'agent.sessionNotFound') throw error
  }

  const storedSession = await repository.findSessionById(request.sessionId)
  if (!storedSession || storedSession.archivedAt) throw new Error('agent.sessionNotFound')
  const workspaceSession = await resolveWorkspaceContextSession(storedSession, repository)

  const project = workspaceSession.projectId
    ? resolveStoredProject(await repository.findProjectById(workspaceSession.projectId))
    : undefined
  const cwd = project
    ? await resolveStoredProjectSessionCwd(workspaceSession, project, worktrees)
    : resolve(getManagedChatCwd())
  const knowledgeBasePath = project
    ? await getAvailableProjectKnowledgeBasePath(project.knowledgeBasePath, getKnowledgeBaseStatus)
    : null
  const disabledGlobalSkillPaths = await readDisabledGlobalSkillPaths()
  const projectTrusted = project
    ? await readProjectTrustForProject(project, readProjectTrust)
    : false
  const skillPaths = await resolveSessionSkillPaths(
    resolveSkillPaths,
    cwd,
    workspaceSession.projectId ? 'project' : 'workspace',
    projectTrusted
  )
  const sourceContext = createStoredSourceContext(workspaceSession)
  const agentDefinitionSources = await resolveAgentDefinitionSources({
    cwd,
    kind: workspaceSession.projectId ? 'project' : 'workspace',
    projectTrusted
  })
  const delegationDefinitions = await resolveVisibleDelegationDefinitions(
    resolveDelegationDefinitions,
    agentDefinitionSources
  )

  if (!project) await mkdir(cwd, { recursive: true })

  try {
    return await utilityHost.createSession({
      sessionId: storedSession.id,
      kind: workspaceSession.projectId ? 'project' : 'workspace',
      projectId: workspaceSession.projectId,
      cwd,
      transcriptPath: storedSession.transcriptPath ?? undefined,
      workspaceTools: listWorkspaceToolDescriptorsForSession({
        kind: workspaceSession.projectId ? 'project' : 'workspace',
        managedContext: storedSession.managedContext
      }),
      ...(project
        ? {
            appendSystemPrompt: [createProjectKnowledgeBaseInstructions(knowledgeBasePath)]
          }
        : {}),
      ...(skillPaths ? { skillPaths } : {}),
      ...(disabledGlobalSkillPaths.length > 0 ? { disabledGlobalSkillPaths } : {}),
      ...(sourceContext ? { systemPromptContext: sourceContext } : {}),
      ...createStoredAgentDefinitionRequest(storedSession),
      ...createDelegationDefinitionsRequest(delegationDefinitions),
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

function createStoredAgentDefinitionRequest(storedSession: StoredSession): {
  agentDefinition?: ResolvedAgentDefinition
} {
  const snapshot = parseStoredAgentDefinitionSnapshot(storedSession)
  if (!snapshot) return {}

  return {
    agentDefinition: {
      ...snapshot,
      ...(storedSession.modelProvider && storedSession.modelId
        ? {
            model: {
              providerId: storedSession.modelProvider,
              modelId: storedSession.modelId
            }
          }
        : {}),
      ...(storedSession.thinkingLevel ? { thinkingLevel: storedSession.thinkingLevel } : {})
    }
  }
}

function parseStoredAgentDefinitionSnapshot(
  storedSession: StoredSession
): ResolvedAgentDefinition | undefined {
  if (!storedSession.agentDefinitionSnapshot) return undefined

  try {
    return agentDefinitionSnapshotSchema.parse(JSON.parse(storedSession.agentDefinitionSnapshot))
  } catch (error) {
    throw new Error('agentDefinitions.snapshotInvalid', { cause: error })
  }
}

export type PreparedManagedChatAgentSession = {
  session: ManagedChatAgentSession
  activate: () => Promise<ManagedChatAgentSession>
}

export async function createManagedChatAgentSession(
  dependencies: CreateManagedChatAgentSessionHandlerDependencies
): Promise<ManagedChatAgentSession> {
  return (await prepareManagedChatAgentSession(dependencies)).activate()
}

export async function prepareManagedChatAgentSession({
  repository,
  utilityHost,
  createSessionId = nanoid,
  readModelDefaults = getModelDefaults,
  getManagedChatCwd = defaultManagedChatCwd,
  title,
  managedContext,
  readDisabledGlobalSkillPaths = noDisabledGlobalSkillPaths,
  resolveSkillPaths,
  agentDefinition: agentDefinitionReference,
  resolveAgentDefinition = resolveAgentDefinitionForSession,
  resolveDelegationDefinitions = resolveAgentDefinitionsForDelegation,
  resolveAgentDefinitionSources = resolveAgentDefinitionSourcesForSession
}: CreateManagedChatAgentSessionHandlerDependencies): Promise<PreparedManagedChatAgentSession> {
  const sessionId = createPiCompatibleSessionId(createSessionId())
  const cwd = resolve(getManagedChatCwd())
  await mkdir(cwd, { recursive: true })

  const modelDefaults = await readModelDefaults()
  const disabledGlobalSkillPaths = await readDisabledGlobalSkillPaths()
  const skillPaths = await resolveSessionSkillPaths(resolveSkillPaths, cwd, 'workspace', false)
  const agentDefinitionSources = await resolveAgentDefinitionSources({
    cwd,
    kind: 'workspace',
    projectTrusted: false
  })
  const agentDefinition = agentDefinitionReference
    ? await resolveAgentDefinition(agentDefinitionReference, { sources: agentDefinitionSources })
    : undefined
  const delegationDefinitions = await resolveVisibleDelegationDefinitions(
    resolveDelegationDefinitions,
    agentDefinitionSources
  )
  const reservedSession = await createSessionsService({
    repository
  }).createManagedChatAgentSession({
    id: sessionId,
    title,
    managedContext,
    agentDefinitionSnapshot: agentDefinition
  })
  let activation: Promise<ManagedChatAgentSession> | undefined

  return {
    session: reservedSession,
    activate() {
      activation ??= (async () => {
        let utilitySessionCreated = false
        try {
          const state = await utilityHost.createSession({
            sessionId,
            kind: 'workspace',
            projectId: null,
            cwd,
            workspaceTools: listWorkspaceToolDescriptorsForSession({
              kind: 'workspace',
              managedContext
            }),
            ...(skillPaths ? { skillPaths } : {}),
            ...(disabledGlobalSkillPaths.length > 0 ? { disabledGlobalSkillPaths } : {}),
            defaultModel: modelDefaults.defaultModel,
            thinkingLevel: modelDefaults.defaultThinking,
            ...(agentDefinition ? { agentDefinition } : {}),
            ...createDelegationDefinitionsRequest(delegationDefinitions)
          })
          utilitySessionCreated = true
          const storedSession = await repository.findSessionById(sessionId)
          if (!storedSession) throw new Error('Managed Chat Session reservation was not found.')
          return toManagedChatAgentSession(
            await repository.update({
              ...storedSession,
              transcriptPath: state.transcriptPath,
              modelProvider: state.modelProvider,
              modelId: state.modelId,
              thinkingLevel: state.thinkingLevel
            })
          )
        } catch (error) {
          if (utilitySessionCreated) {
            await utilityHost.deleteSession({ sessionId }).catch(() => undefined)
          }
          await repository.deleteById(sessionId).catch(() => undefined)
          throw error
        }
      })()
      return activation
    }
  }
}

function createPiCompatibleSessionId(candidate: string): string {
  const sessionId = candidate.replace(/^[-_]/, '0').replace(/[-_]$/, '0')
  if (!AGENT_SESSION_ID_PATTERN.test(sessionId)) throw new Error('agent.invalidSessionId')
  return sessionId
}

async function readProjectTrustForProject(
  project: StoredProject,
  readProjectTrust?: ReadProjectTrust
): Promise<boolean> {
  if (readProjectTrust) {
    try {
      return await readProjectTrust(project.id, resolve(project.path))
    } catch {
      return false
    }
  }
  return project.agentResourcesTrusted === true
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

async function resolveVisibleDelegationDefinitions(
  resolveDelegationDefinitions: ResolveAgentDefinitionsForDelegation,
  sources: Awaited<ReturnType<typeof resolveAgentDefinitionSourcesForSession>>
): Promise<DelegationAgentDefinition[]> {
  return resolveDelegationDefinitions({ sources })
}

function createDelegationDefinitionsRequest(definitions: DelegationAgentDefinition[]): {
  delegationDefinitions?: DelegationAgentDefinition[]
} {
  return definitions.length > 0 ? { delegationDefinitions: definitions } : {}
}

async function resolveWorkspaceContextSession(
  storedSession: StoredSession,
  repository: Pick<SessionsRepository, 'findSessionById'>
): Promise<StoredSession> {
  if (!storedSession.workspaceContextSessionId) return storedSession

  const workspaceSession = await repository.findSessionById(storedSession.workspaceContextSessionId)
  if (
    !workspaceSession ||
    workspaceSession.workspaceContextSessionId ||
    workspaceSession.archivedAt ||
    workspaceSession.projectId !== storedSession.projectId
  ) {
    throw new Error('agent.sessionNotFound')
  }
  return workspaceSession
}

function resolveStoredProject(project: StoredProject | undefined): StoredProject {
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

export function createProjectKnowledgeBaseInstructions(knowledgeBasePath?: string | null): string {
  if (!knowledgeBasePath) {
    return `## Project Knowledge Base\n\nThe Project Knowledge Base is not configured. If the builder asks you to read or save durable project knowledge, clearly report that it is unavailable and direct them to set up the Knowledge Base in Space Zero. Do not pretend that knowledge was saved.`
  }

  return `## Project Knowledge Base\n\nThe durable Knowledge Base folder for this project is:\n\n${knowledgeBasePath}\n\nUse this folder when explicitly asked or when it is clearly useful for durable notes, decisions, debugging findings, handoff summaries, and user-requested project knowledge. Do not fill it with transient output or routine command logs. Read existing context before editing. When you add an important document, update the project README.md index with a useful link and description. The project source repository and this Knowledge Base folder are separate; keep source code in the project repository by default.`
}

async function resolveStoredProjectSessionCwd(
  session: StoredSession,
  project: { id: string; path: string } | undefined,
  worktrees: Pick<ManagedWorktreeService, 'validate'>
): Promise<string> {
  if (!project) throw new Error('Project not found')
  const worktreeValues = [
    session.worktreePath,
    session.worktreeBranch,
    session.worktreeBaseRevision
  ]
  if (worktreeValues.every((value) => !value)) return resolve(project.path)
  if (!session.worktreePath || !session.worktreeBranch || !session.worktreeBaseRevision) {
    throw new Error('session.worktreeMetadataIncomplete')
  }
  const worktree = {
    path: resolve(session.worktreePath),
    branch: session.worktreeBranch,
    baseRevision: session.worktreeBaseRevision
  }
  if (
    !(await worktrees.validate({
      projectPath: resolve(project.path),
      projectId: project.id,
      sessionId: session.id,
      worktree
    }))
  ) {
    throw new Error('session.worktreeMissing')
  }
  return worktree.path
}

function createStoredSourceContext(session: StoredSession): string | undefined {
  if (!session.sourceType) return undefined
  if (
    !session.sourceRepositoryOwner ||
    !session.sourceRepositoryName ||
    typeof session.sourceNumber !== 'number' ||
    !session.sourceUrl ||
    !session.sourceTitle
  ) {
    throw new Error('session.sourceMetadataIncomplete')
  }
  const label = session.sourceType === 'issue' ? 'Issue' : 'Pull Request'
  return [
    '## Space Zero GitHub source',
    `Type: ${label}`,
    `Repository: ${session.sourceRepositoryOwner}/${session.sourceRepositoryName}`,
    `Number: #${session.sourceNumber}`,
    `Title: ${session.sourceTitle}`,
    `URL: ${session.sourceUrl}`,
    '',
    'Treat this source as context. Do not comment, close, approve, merge, assign, or otherwise mutate GitHub unless the builder explicitly asks.'
  ].join('\n')
}

function samePath(left: string, right: string): boolean {
  const normalizedLeft = resolve(left)
  const normalizedRight = resolve(right)
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight
}

function defaultManagedChatCwd(): string {
  return join(app.getPath('userData'), 'workspace-sessions')
}
