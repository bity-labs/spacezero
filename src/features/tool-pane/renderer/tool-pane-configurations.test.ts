import { describe, expect, it } from 'vitest'

import {
  createKnowledgeBaseToolPaneConfiguration,
  createProjectSessionToolPaneConfiguration,
  createWorkspaceSessionToolPaneConfiguration
} from './tool-pane-configurations'

describe('Tool Pane contextual configurations', () => {
  it('targets the ordered stable tool sets and context-owned defaults', () => {
    const project = createProjectSessionToolPaneConfiguration({
      id: 'project-session-1',
      projectId: 'project-1'
    })
    const workspace = createWorkspaceSessionToolPaneConfiguration({ id: 'workspace-session-1' })
    const knowledgeBase = createKnowledgeBaseToolPaneConfiguration()

    expect(project).toMatchObject({
      contextKey: 'session:project-session-1',
      defaultToolId: 'files',
      capabilities: {
        kind: 'project-session',
        projectId: 'project-1',
        sessionId: 'project-session-1'
      }
    })
    expect(project.tools.map((tool) => tool.id)).toEqual(['files', 'git', 'browser', 'terminal'])
    expect(project.tools[0]).toMatchObject({ id: 'files', available: true })
    expect(project.tools[0]?.render).toBeTypeOf('function')
    expect(project.tools[2]).toMatchObject({ id: 'browser', available: true })
    expect(project.tools[2]?.render).toBeTypeOf('function')
    expect(project.tools[3]).toMatchObject({ id: 'terminal', available: true })
    expect(project.tools[3]?.render).toBeTypeOf('function')

    expect(workspace).toMatchObject({
      contextKey: 'session:workspace-session-1',
      defaultToolId: 'browser',
      capabilities: { kind: 'workspace-session', sessionId: 'workspace-session-1' }
    })
    expect(workspace.tools.map((tool) => tool.id)).toEqual(['browser', 'terminal'])

    expect(knowledgeBase).toMatchObject({
      contextKey: 'knowledge-base',
      defaultToolId: 'files',
      capabilities: { kind: 'knowledge-base' }
    })
    expect(knowledgeBase.tools.map((tool) => tool.id)).toEqual([
      'files',
      'git',
      'browser',
      'terminal'
    ])
    expect(knowledgeBase.tools[0]).toMatchObject({ id: 'files', available: true })
    expect(knowledgeBase.tools[0]?.render).toBeTypeOf('function')
    expect(workspace.tools[0]).toMatchObject({ id: 'browser', available: true })
    expect(workspace.tools[0]?.render).toBeTypeOf('function')
    expect(workspace.tools[1]).toMatchObject({ id: 'terminal', available: true })
    expect(workspace.tools[1]?.render).toBeTypeOf('function')
    expect(knowledgeBase.tools[1]).toMatchObject({ id: 'git', available: false })
    expect(knowledgeBase.tools[2]).toMatchObject({ id: 'browser', available: true })
    expect(knowledgeBase.tools[2]?.render).toBeTypeOf('function')
    expect(knowledgeBase.tools[3]).toMatchObject({ id: 'terminal', available: true })
    expect(knowledgeBase.tools[3]?.render).toBeTypeOf('function')
  })
})
