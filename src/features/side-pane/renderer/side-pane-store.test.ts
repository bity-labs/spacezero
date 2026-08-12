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
})
