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
}

export type CreateWorkspaceAgentSessionHandlerDependencies = CreateAgentSessionHandlerDependencies & {
  getWorkspaceSessionCwd?: () => string
}

export async function createProjectAgentSession(
  input: unknown,
  {
    repository,
    utilityHost,
    createSessionId = nanoid,
    readModelDefaults = getModelDefaults
  }: CreateAgentSessionHandlerDependencies
): Promise<AgentSessionState> {
  const request = createSessionRequestSchema.parse(input)
  const project = await repository.findProjectById(request.projectId)
  if (!project) throw new Error('Project not found')

  const projectPath = resolve(project.path)
  if (resolve(request.cwd) !== projectPath) throw new Error('Session cwd must match the project path')

  const sessionId = createSessionId()
  const modelDefaults = await readModelDefaults()
  const state = await utilityHost.createSession({
    sessionId,
    kind: 'project',
    projectId: request.projectId,
    cwd: projectPath,
    workspaceTools: getWorkspaceToolRegistry().listAgentDescriptors(),
    defaultModel: modelDefaults.defaultModel,
    thinkingLevel: modelDefaults.defaultThinking
  })

  try {
    await createSessionsService({ repository }).createProjectAgentSession({
      id: sessionId,
      projectId: request.projectId,
      transcriptPath: state.transcriptPath
    })
  } catch (error) {
    await utilityHost.deleteSession({ sessionId }).catch(() => undefined)
    throw error
  }

  return state
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
      transcriptPath: state.transcriptPath
    })
  } catch (error) {
    await utilityHost.deleteSession({ sessionId }).catch(() => undefined)
    throw error
  }
}

function defaultWorkspaceSessionCwd(): string {
  return join(app.getPath('userData'), 'workspace-sessions')
}
