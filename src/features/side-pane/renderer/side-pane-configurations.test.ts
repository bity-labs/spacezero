import { describe, expect, it } from 'vitest'

import {
  createGlobalChatSidePaneConfiguration,
  createKnowledgeBaseSidePaneConfiguration,
  createProjectHomeSidePaneConfiguration,
  createProjectSessionSidePaneConfiguration
} from './side-pane-configurations'

describe('Side Pane contextual configurations', () => {
  it('targets the ordered stable category sets and context-owned defaults', () => {
    const projectHome = createProjectHomeSidePaneConfiguration({ id: 'project-1' })
    const project = createProjectSessionSidePaneConfiguration({
      id: 'project-session-1',
      projectId: 'project-1'
    })
    const globalChat = createGlobalChatSidePaneConfiguration()
    const knowledgeBase = createKnowledgeBaseSidePaneConfiguration()

    expect(projectHome).toMatchObject({
      contextKey: 'project:project-1',
      defaultCategoryId: 'files',
      capabilities: { kind: 'project-home', projectId: 'project-1' }
    })
    expect(projectHome.categories.map((category) => category.id)).toEqual([
      'files',
      'git',
      'browser',
      'terminal'
    ])
    expect(projectHome.categories.every((category) => category.available && category.render)).toBe(
      true
    )

    expect(project).toMatchObject({
      contextKey: 'session:project-session-1',
      defaultCategoryId: 'files',
      capabilities: {
        kind: 'project-session',
        projectId: 'project-1',
        sessionId: 'project-session-1'
      }
    })
    expect(project.categories.map((category) => category.id)).toEqual([
      'files',
      'git',
      'browser',
      'terminal'
    ])
    expect(project.categories[0]).toMatchObject({ id: 'files', available: true })
    expect(project.categories[0]?.render).toBeTypeOf('function')
    expect(project.categories[1]).toMatchObject({ id: 'git', available: true })
    expect(project.categories[1]?.render).toBeTypeOf('function')
    expect(project.categories[2]).toMatchObject({ id: 'browser', available: true })
    expect(project.categories[2]?.render).toBeTypeOf('function')
    expect(project.categories[3]).toMatchObject({ id: 'terminal', available: true })
    expect(project.categories[3]?.render).toBeTypeOf('function')

    expect(globalChat).toMatchObject({
      contextKey: 'global-chat',
      defaultCategoryId: 'browser',
      capabilities: { kind: 'global-chat' }
    })
    expect(globalChat.categories.map((category) => category.id)).toEqual(['browser', 'terminal'])
    expect(
      globalChat.categories.some((category) => category.id === 'files' || category.id === 'git')
    ).toBe(false)

    expect(knowledgeBase).toMatchObject({
      contextKey: 'knowledge-base',
      defaultCategoryId: 'files',
      defaultOpen: true,
      capabilities: { kind: 'knowledge-base' }
    })
    expect(knowledgeBase.categories.map((category) => category.id)).toEqual([
      'files',
      'git',
      'browser',
      'terminal'
    ])
    expect(knowledgeBase.categories[0]).toMatchObject({ id: 'files', available: true })
    expect(knowledgeBase.categories[0]?.render).toBeTypeOf('function')
    expect(knowledgeBase.categories[1]).toMatchObject({ id: 'git', available: true })
    expect(knowledgeBase.categories[1]?.render).toBeTypeOf('function')
    expect(knowledgeBase.categories[2]).toMatchObject({ id: 'browser', available: true })
    expect(knowledgeBase.categories[2]?.render).toBeTypeOf('function')
    expect(knowledgeBase.categories[3]).toMatchObject({ id: 'terminal', available: true })
    expect(knowledgeBase.categories[3]?.render).toBeTypeOf('function')
  })
})
