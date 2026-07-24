import { app } from 'electron'
import { mkdir } from 'node:fs/promises'
import { nanoid } from 'nanoid'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { z } from 'zod'

import type { AgentUtilityProcessHost } from './agent-utility-process'
import { getWorkspaceToolRegistry } from './workspace-tool-control-plane'
import {
  withProjectLifecycleLock as runWithProjectLifecycleLock,
  type ProjectLifecycleLock
} from '../../projects/main/project-lifecycle-lock'
import type { Clock, SessionsRepository, StoredSession } from '../../sessions/main/sessions.service'
import { createSessionsService } from '../../sessions/main/sessions.service'
import type { KnowledgeBaseStatus } from '../../knowledge-base/shared'
import type { ProjectSession, SessionGitHubSource, WorkspaceSession } from '../../sessions/shared'
import type {
  ManagedWorktreeService,
  ManagedWorktreeStartPoint
} from '../../sessions/main/managed-worktree.service'
import type {
  AgentDefinitionReference,
  AgentSessionKind,
  AgentSessionState,
  ApplyAgentDefinitionToFreshSessionRequest,
  ResolvedAgentDefinition
} from '../../../shared/agent-protocol'
import type { AgentSkillPath } from '../shared/agent-skill.model'
import { getDisabledGlobalSkillPaths } from './agent-skill-settings.service'
import { defaultModelSettingSchema, thinkingLevelSchema } from '../../../shared/model-settings'
import { getModelDefaults } from '../../settings/main/model-defaults-settings.service'
import {
  resolveAgentDefinitionForSession,
  type ResolveAgentDefinitionForSession
} from '../../agents/main/agent-definition-resolver'

const agentDefinitionReferenceSchema = z.object({
  id: z.string().trim().min(1)
})

const agentDefinitionSnapshotSchema = z
  .object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    body: z.string(),
    model: defaultModelSettingSchema.optional(),
    thinkingLevel: thinkingLevelSchema.optional(),
    tools: z.array(z.string().trim().min(1)).optional()
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
}

export type CreateWorkspaceAgentSessionHandlerDependencies = Omit<
  CreateAgentSessionHandlerDependencies,
  'worktrees'
> & {
  getWorkspaceSessionCwd?: () => string
  title?: string
  managedContext?: 'knowledge-base'
  agentDefinition?: AgentDefinitionReference
}

export type RestoreAgentSessionHandlerDependencies = {
  repository: SessionsRepository
  utilityHost: Pick<AgentUtilityProcessHost, 'createSession' | 'getState'>
  worktrees?: Pick<ManagedWorktreeService, 'validate'>
  getWorkspaceSessionCwd?: () => string
  getKnowledgeBaseStatus?: () => Promise<KnowledgeBaseStatus>
  readDisabledGlobalSkillPaths?: typeof getDisabledGlobalSkillPaths
  readProjectTrust?: ReadProjectTrust
  resolveSkillPaths?: ResolveSkillPaths
}

export type ApplyAgentDefinitionToFreshSessionDependencies = Omit<
  RestoreAgentSessionHandlerDependencies,
  'utilityHost'
> & {
  utilityHost: Pick<AgentUtilityProcessHost, 'createSession' | 'deleteSession' | 'getState'>
  readModelDefaults?: typeof getModelDefaults
  resolveAgentDefinition?: ResolveAgentDefinitionForSession
  now?: Clock
}

const pendingSessionRestores = new Map<string, Promise<AgentSessionState>>()
const noDisabledGlobalSkillPaths: typeof getDisabledGlobalSkillPaths = async () => []
// Project-local resources fail closed until a main-owned persisted trust decision is integrated.
const denyProjectTrustWithoutPersistedDecision: ReadProjectTrust = async () => false
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
    readProjectTrust = denyProjectTrustWithoutPersistedDecision,
    resolveSkillPaths,
    resolveAgentDefinition = resolveAgentDefinitionForSession
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
      const projectTrusted = await readProjectTrust(projectId, projectPath)
      const skillPaths = await resolveSessionSkillPaths(
        resolveSkillPaths,
        worktree.path,
        'project',
        projectTrusted
      )
      agentDefinitionSnapshot = request.agentDefinition
        ? await resolveAgentDefinition(request.agentDefinition)
        : undefined
      state = await utilityHost.createSession({
        sessionId,
        kind: 'project',
        projectId,
        cwd: worktree.path,
        workspaceTools: getWorkspaceToolRegistry().listAgentDescriptors(),
        appendSystemPrompt: [createProjectKnowledgeBaseInstructions(knowledgeBasePath)],
        ...(skillPaths ? { skillPaths } : {}),
        ...(disabledGlobalSkillPaths.length > 0 ? { disabledGlobalSkillPaths } : {}),
        ...(request.systemPromptContext
          ? { systemPromptContext: request.systemPromptContext }
          : {}),
        defaultModel: modelDefaults.defaultModel,
        thinkingLevel: modelDefaults.defaultThinking,
        ...(agentDefinitionSnapshot ? { agentDefinition: agentDefinitionSnapshot } : {})
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

export async function applyAgentDefinitionToFreshSession(
  input: unknown,
  {
    repository,
    utilityHost,
    worktrees = unavailableStoredWorktrees,
    getWorkspaceSessionCwd = defaultWorkspaceSessionCwd,
    getKnowledgeBaseStatus = getUnconfiguredKnowledgeBaseStatus,
    readDisabledGlobalSkillPaths = noDisabledGlobalSkillPaths,
    readProjectTrust = denyProjectTrustWithoutPersistedDecision,
    resolveSkillPaths,
    readModelDefaults = getModelDefaults,
    resolveAgentDefinition = resolveAgentDefinitionForSession,
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
      getWorkspaceSessionCwd,
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

  const agentDefinition = await resolveAgentDefinition(request.agentDefinition)
  const modelDefaults = await readModelDefaults()
  const project = storedSession.projectId
    ? resolveStoredProject(await repository.findProjectById(storedSession.projectId))
    : undefined
  const cwd = project
    ? await resolveStoredProjectSessionCwd(storedSession, project, worktrees)
    : resolve(getWorkspaceSessionCwd())
  const knowledgeBasePath = project
    ? await getAvailableProjectKnowledgeBasePath(project.knowledgeBasePath, getKnowledgeBaseStatus)
    : null
  const disabledGlobalSkillPaths = await readDisabledGlobalSkillPaths()
  const projectTrusted = project ? await readProjectTrust(project.id, resolve(project.path)) : false
  const skillPaths = await resolveSessionSkillPaths(
    resolveSkillPaths,
    cwd,
    storedSession.projectId ? 'project' : 'workspace',
    projectTrusted
  )
  const sourceContext = createStoredSourceContext(storedSession)

  if (!project) await mkdir(cwd, { recursive: true })

  const baseCreateRequest = {
    sessionId: storedSession.id,
    kind: storedSession.projectId ? ('project' as const) : ('workspace' as const),
    projectId: storedSession.projectId,
    cwd,
    transcriptPath: storedSession.transcriptPath ?? currentState.transcriptPath ?? undefined,
    workspaceTools: getWorkspaceToolRegistry().listAgentDescriptors(),
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
    getWorkspaceSessionCwd = defaultWorkspaceSessionCwd,
    getKnowledgeBaseStatus = getUnconfiguredKnowledgeBaseStatus,
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
    worktrees,
    getWorkspaceSessionCwd,
    getKnowledgeBaseStatus,
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
    worktrees = unavailableStoredWorktrees,
    getWorkspaceSessionCwd = defaultWorkspaceSessionCwd,
    getKnowledgeBaseStatus = getUnconfiguredKnowledgeBaseStatus,
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

  const project = storedSession.projectId
    ? resolveStoredProject(await repository.findProjectById(storedSession.projectId))
    : undefined
  const cwd = project
    ? await resolveStoredProjectSessionCwd(storedSession, project, worktrees)
    : resolve(getWorkspaceSessionCwd())
  const knowledgeBasePath = project
    ? await getAvailableProjectKnowledgeBasePath(project.knowledgeBasePath, getKnowledgeBaseStatus)
    : null
  const disabledGlobalSkillPaths = await readDisabledGlobalSkillPaths()
  const projectTrusted = project ? await readProjectTrust(project.id, resolve(project.path)) : false
  const skillPaths = await resolveSessionSkillPaths(
    resolveSkillPaths,
    cwd,
    storedSession.projectId ? 'project' : 'workspace',
    projectTrusted
  )
  const sourceContext = createStoredSourceContext(storedSession)

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
            appendSystemPrompt: [createProjectKnowledgeBaseInstructions(knowledgeBasePath)]
          }
        : {}),
      ...(skillPaths ? { skillPaths } : {}),
      ...(disabledGlobalSkillPaths.length > 0 ? { disabledGlobalSkillPaths } : {}),
      ...(sourceContext ? { systemPromptContext: sourceContext } : {}),
      ...createStoredAgentDefinitionRequest(storedSession),
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

export async function createWorkspaceAgentSession({
  repository,
  utilityHost,
  createSessionId = nanoid,
  readModelDefaults = getModelDefaults,
  getWorkspaceSessionCwd = defaultWorkspaceSessionCwd,
  title,
  managedContext,
  readDisabledGlobalSkillPaths = noDisabledGlobalSkillPaths,
  resolveSkillPaths,
  agentDefinition: agentDefinitionReference,
  resolveAgentDefinition = resolveAgentDefinitionForSession
}: CreateWorkspaceAgentSessionHandlerDependencies): Promise<WorkspaceSession> {
  const sessionId = createSessionId()
  const cwd = resolve(getWorkspaceSessionCwd())
  await mkdir(cwd, { recursive: true })

  const modelDefaults = await readModelDefaults()
  const disabledGlobalSkillPaths = await readDisabledGlobalSkillPaths()
  const skillPaths = await resolveSessionSkillPaths(resolveSkillPaths, cwd, 'workspace', false)
  const agentDefinition = agentDefinitionReference
    ? await resolveAgentDefinition(agentDefinitionReference)
    : undefined
  const state = await utilityHost.createSession({
    sessionId,
    kind: 'workspace',
    projectId: null,
    cwd,
    workspaceTools: getWorkspaceToolRegistry().listAgentDescriptors(),
    ...(skillPaths ? { skillPaths } : {}),
    ...(disabledGlobalSkillPaths.length > 0 ? { disabledGlobalSkillPaths } : {}),
    defaultModel: modelDefaults.defaultModel,
    thinkingLevel: modelDefaults.defaultThinking,
    ...(agentDefinition ? { agentDefinition } : {})
  })

  try {
    return await createSessionsService({ repository }).createWorkspaceAgentSession({
      id: sessionId,
      transcriptPath: state.transcriptPath,
      modelProvider: state.modelProvider,
      modelId: state.modelId,
      thinkingLevel: state.thinkingLevel,
      title,
      managedContext,
      agentDefinitionSnapshot: agentDefinition
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

function defaultWorkspaceSessionCwd(): string {
  return join(app.getPath('userData'), 'workspace-sessions')
}
