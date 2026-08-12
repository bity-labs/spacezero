import { beforeEach, describe, expect, it } from 'vitest'

import { resetSidePaneStore, useSidePaneStore } from './side-pane-store'

describe('Side Pane store', () => {
  beforeEach(() => {
    window.localStorage.clear()
    resetSidePaneStore()
  })

  it('migrates persisted Tool Pane layout into a category tab without losing context width', async () => {
    window.localStorage.removeItem('spacezero.sidePane')
    window.localStorage.setItem(
      'spacezero.toolPane',
      JSON.stringify({
        state: {
          contexts: {
            'session:session-1': { isOpen: true, width: 640, activeToolId: 'git' }
          }
        },
        version: 0
      })
    )

    await useSidePaneStore.persist.rehydrate()

    expect(useSidePaneStore.getState().contexts['session:session-1']).toEqual({
      isOpen: true,
      width: 640,
      activeTabId: 'git:1',
      tabs: [{ id: 'git:1', categoryId: 'git' }],
      categoryMru: { git: 'git:1' }
    })
  })

  it('rehydrates each context ordered tabs, active tab, width, open state, and category MRU', async () => {
    const contexts = {
      'project:project-1': {
        isOpen: true,
        width: 612,
        activeTabId: 'terminal:1',
        tabs: [
          { id: 'files:1', categoryId: 'files' as const },
          { id: 'terminal:1', categoryId: 'terminal' as const }
        ],
        categoryMru: { files: 'files:1', terminal: 'terminal:1' }
      },
      'global-chat': {
        isOpen: false,
        width: 504,
        activeTabId: 'browser:1',
        tabs: [{ id: 'browser:1', categoryId: 'browser' as const }],
        categoryMru: { browser: 'browser:1' }
      }
    }
    window.localStorage.setItem(
      'spacezero.sidePane',
      JSON.stringify({ state: { contexts }, version: 1 })
    )

    await useSidePaneStore.persist.rehydrate()

    expect(useSidePaneStore.getState().contexts).toEqual(contexts)
  })

  it('keeps tab, width, open state, and MRU mutations isolated to their context', () => {
    useSidePaneStore.getState().openCategory('project:project-1', 'files')
    useSidePaneStore.getState().setWidth('project:project-1', 620)
    useSidePaneStore.getState().openCategory('global-chat', 'browser')
    useSidePaneStore.getState().setWidth('global-chat', 480)
    const globalChatState = structuredClone(useSidePaneStore.getState().contexts['global-chat'])

    useSidePaneStore.getState().openCategory('project:project-1', 'terminal')
    useSidePaneStore.getState().collapse('project:project-1')

    expect(useSidePaneStore.getState().contexts['global-chat']).toEqual(globalChatState)
    expect(useSidePaneStore.getState().contexts['project:project-1']).toMatchObject({
      isOpen: false,
      width: 620,
      activeTabId: 'terminal:1',
      tabs: [
        { id: 'files:1', categoryId: 'files' },
        { id: 'terminal:1', categoryId: 'terminal' }
      ],
      categoryMru: { files: 'files:1', terminal: 'terminal:1' }
    })
  })
})
