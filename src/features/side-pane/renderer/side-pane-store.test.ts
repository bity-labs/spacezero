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
        activeTabId: 'browser-tab-main-owned',
        tabs: [{ id: 'browser-tab-main-owned', categoryId: 'browser' as const }],
        categoryMru: { browser: 'browser-tab-main-owned' }
      }
    }
    window.localStorage.setItem(
      'spacezero.sidePane',
      JSON.stringify({ state: { contexts }, version: 1 })
    )

    await useSidePaneStore.persist.rehydrate()

    expect(useSidePaneStore.getState().contexts).toEqual(contexts)
  })

  it('removes legacy synthetic Browser descriptors during rehydration', async () => {
    window.localStorage.setItem(
      'spacezero.sidePane',
      JSON.stringify({
        state: {
          contexts: {
            'global-chat': {
              isOpen: true,
              width: 504,
              activeTabId: 'browser:1',
              tabs: [{ id: 'browser:1', categoryId: 'browser' }],
              categoryMru: { browser: 'browser:1' }
            }
          }
        },
        version: 1
      })
    )

    await useSidePaneStore.persist.rehydrate()

    expect(useSidePaneStore.getState().contexts['global-chat']).toEqual({
      isOpen: false,
      width: 504,
      activeTabId: null,
      tabs: [],
      categoryMru: {}
    })
    expect(window.localStorage.getItem('spacezero.sidePane') ?? '').not.toContain('browser:1')
  })

  it('migrates Browser resource order into peer Side Pane tabs without moving other categories', () => {
    useSidePaneStore.setState({
      contexts: {
        'session:session-1': {
          isOpen: true,
          width: 600,
          activeTabId: 'browser-tab-stale',
          tabs: [
            { id: 'files:1', categoryId: 'files' },
            { id: 'browser-tab-stale', categoryId: 'browser' },
            { id: 'terminal:1', categoryId: 'terminal' }
          ],
          categoryMru: { browser: 'browser-tab-stale' }
        }
      }
    })

    useSidePaneStore.getState().syncCategoryTabs(
      'session:session-1',
      'browser',
      [
        { id: 'browser-tab-2', categoryId: 'browser', title: 'Docs' },
        { id: 'browser-tab-1', categoryId: 'browser', title: 'App' }
      ],
      'browser-tab-2',
      true
    )

    expect(useSidePaneStore.getState().contexts['session:session-1']).toEqual({
      isOpen: true,
      width: 600,
      activeTabId: 'browser-tab-2',
      tabs: [
        { id: 'files:1', categoryId: 'files' },
        { id: 'browser-tab-2', categoryId: 'browser', title: 'Docs' },
        { id: 'browser-tab-1', categoryId: 'browser', title: 'App' },
        { id: 'terminal:1', categoryId: 'terminal' }
      ],
      categoryMru: { browser: 'browser-tab-2' }
    })
  })

  it('keeps tab, width, open state, and MRU mutations isolated to their context', () => {
    useSidePaneStore.getState().openCategory('project:project-1', 'files')
    useSidePaneStore.getState().setWidth('project:project-1', 620)
    useSidePaneStore
      .getState()
      .syncCategoryTabs(
        'global-chat',
        'browser',
        [{ id: 'browser-tab-global', categoryId: 'browser' }],
        'browser-tab-global',
        true
      )
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
