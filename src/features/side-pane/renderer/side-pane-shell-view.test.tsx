import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { SidePaneCategoryDescriptor } from './side-pane-shell'
import { SidePaneLauncherView, SidePaneShellView } from './side-pane-shell-view'

const categories: readonly SidePaneCategoryDescriptor[] = [
  { id: 'files', label: 'Files', available: true, icon: () => null },
  { id: 'git', label: 'Git Diff', available: true, icon: () => null },
  { id: 'browser', label: 'Browser', available: true, icon: () => null },
  { id: 'terminal', label: 'Terminal', available: false, icon: () => null }
]

describe('SidePaneShellView', () => {
  it('emits category intent from the collapsed launcher without app runtime state', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()

    render(<SidePaneLauncherView categories={categories} onSelect={onSelect} />)

    await user.click(screen.getByRole('button', { name: 'Files' }))

    expect(onSelect).toHaveBeenCalledWith('files')
    expect(screen.getByRole('button', { name: 'Terminal — Coming soon' })).toBeDisabled()
  })

  it('renders active, dirty, and preview peer tabs and emits tab intent', async () => {
    const onActivateTab = vi.fn()
    const onCloseTab = vi.fn()
    const user = userEvent.setup()

    render(
      <SidePaneShellView
        activeContent={<div>Files content</div>}
        activeTabId="files:preview"
        canOpen
        categories={categories}
        categoryMru={{ files: 'files:preview' }}
        contextKey="session:story"
        isOpen
        maxWidth={720}
        minWidth={400}
        renderedWidth={560}
        tabs={[
          {
            id: 'files:preview',
            categoryId: 'files',
            label: 'app.tsx',
            preview: true,
            dirty: true
          },
          { id: 'browser:docs', categoryId: 'browser', title: 'Space Zero Docs' }
        ]}
        onActivateTab={onActivateTab}
        onCloseTab={onCloseTab}
        onCreateCategory={vi.fn()}
        onOpenCategory={vi.fn()}
        onReorderTab={vi.fn()}
      >
        <div>Chat</div>
      </SidePaneShellView>
    )

    expect(screen.getByRole('complementary', { name: 'Side Pane' })).toHaveStyle({ width: '560px' })
    expect(screen.getByRole('tab', { name: 'Modified app.tsx preview' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByRole('tab', { name: 'Modified app.tsx preview' })).toHaveTextContent('●')
    expect(screen.getByText('Files content')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Space Zero Docs' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close app.tsx' }))

    expect(onActivateTab).toHaveBeenCalledWith('browser:docs')
    await waitFor(() => expect(onCloseTab).toHaveBeenCalledWith('files:preview'))
  })
})
