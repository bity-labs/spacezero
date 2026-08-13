import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { WorkspaceShellLayout } from './workspace-shell-layout'

describe('WorkspaceShellLayout', () => {
  it('composes workspace regions and emits titlebar control intent', () => {
    const onToggleLeftSidebar = vi.fn()
    const onOpenCommandPalette = vi.fn()

    render(
      <WorkspaceShellLayout
        isLeftSidebarOpen
        leftSidebarWidth={240}
        sidePaneHeaderWidth={48}
        leftSidebar={<aside>Workspace navigation</aside>}
        titlebarCenter={<span>Selected project</span>}
        sidePaneHeader={<span>Side pane controls</span>}
        mainContent={<p>Project content</p>}
        labels={{
          hideLeftSidebar: 'Hide left sidebar',
          showLeftSidebar: 'Show left sidebar',
          openCommandPalette: 'Open command palette',
          mainContent: 'Workspace content',
          resizeLeftSidebar: 'Resize left sidebar'
        }}
        onToggleLeftSidebar={onToggleLeftSidebar}
        onOpenCommandPalette={onOpenCommandPalette}
      />
    )

    expect(screen.getByText('Workspace navigation')).toBeInTheDocument()
    expect(screen.getByText('Selected project')).toBeInTheDocument()
    expect(screen.getByText('Side pane controls')).toBeInTheDocument()
    expect(screen.getByRole('main', { name: 'Workspace content' })).toHaveTextContent(
      'Project content'
    )

    fireEvent.click(screen.getByRole('button', { name: 'Hide left sidebar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open command palette' }))

    expect(onToggleLeftSidebar).toHaveBeenCalledOnce()
    expect(onOpenCommandPalette).toHaveBeenCalledOnce()
  })
})
