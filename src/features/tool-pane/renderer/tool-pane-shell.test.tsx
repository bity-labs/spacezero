import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { resetToolPaneStore, useToolPaneStore } from './tool-pane-store'
import {
  getRenderedToolPaneWidth,
  ToolPaneHeaderControls,
  ToolPaneShell,
  ToolPaneToggleButton,
  type ToolDescriptor,
  type ToolPaneConfiguration
} from './tool-pane-shell'

const tools: readonly ToolDescriptor[] = [
  {
    id: 'browser',
    label: 'Browser',
    available: true,
    icon: () => null,
    render: ({ contextKey }) => <div>Browser for {contextKey}</div>
  }
]

const configuration: ToolPaneConfiguration = {
  contextKey: 'workspace-session:session-1',
  capabilities: { kind: 'workspace-session', sessionId: 'session-1' },
  defaultToolId: 'browser',
  tools
}

describe('ToolPaneShell', () => {
  beforeEach(() => {
    window.localStorage.clear()
    resetToolPaneStore()
  })

  it('starts collapsed with a vertical Tool Switcher at the right edge', () => {
    render(
      <ToolPaneShell
        contextKey="workspace-session:session-1"
        capabilities={{ kind: 'workspace-session', sessionId: 'session-1' }}
        defaultToolId="browser"
        tools={tools}
      >
        <div>Chat</div>
      </ToolPaneShell>
    )

    expect(screen.getByText('Chat')).toBeInTheDocument()
    expect(screen.getByRole('toolbar', { name: 'Tool Switcher' })).toHaveAttribute(
      'aria-orientation',
      'vertical'
    )
    expect(screen.getByRole('button', { name: 'Browser' })).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Tool Pane' })).not.toBeInTheDocument()
  })

  it('opens the selected tool and renders the expanded Tool Switcher in the shared header controls', async () => {
    const user = userEvent.setup()

    render(
      <>
        <ToolPaneHeaderControls configuration={configuration} />
        <ToolPaneShell
          contextKey="workspace-session:session-1"
          capabilities={{ kind: 'workspace-session', sessionId: 'session-1' }}
          defaultToolId="browser"
          tools={tools}
          showInlineHeaderSwitcher={false}
        >
          <div>Chat</div>
        </ToolPaneShell>
      </>
    )

    await user.click(screen.getByRole('button', { name: 'Browser' }))

    const pane = screen.getByRole('complementary', { name: 'Tool Pane' })
    const headerControls = screen.getByLabelText('Tool Pane header controls')
    const switcher = screen.getByRole('toolbar', { name: 'Tool Switcher' })
    const toggle = screen.getByRole('button', { name: 'Toggle Tool Pane' })

    expect(pane).toHaveTextContent('Browser for workspace-session:session-1')
    expect(switcher).toHaveAttribute('aria-orientation', 'horizontal')
    expect(headerControls).toContainElement(switcher)
    expect(headerControls).toContainElement(toggle)
    expect(pane).not.toContainElement(switcher)
    expect(headerControls).toHaveClass('w-full')
    expect(headerControls).toHaveClass('flex-1')
    expect(headerControls).toHaveClass('border-l')
    expect(headerControls).toHaveClass('border-b')
    expect(headerControls).not.toHaveClass('titlebar-control')
    expect(switcher).toHaveClass('titlebar-control')
    expect(toggle).toHaveClass('titlebar-control')
  })

  it('uses the shared clamped pane width for default and persisted header tracks', () => {
    expect(getRenderedToolPaneWidth(1024, undefined)).toBe(614)
    expect(getRenderedToolPaneWidth(696, undefined)).toBe(332)
    expect(getRenderedToolPaneWidth(696, 638)).toBe(332)
    expect(getRenderedToolPaneWidth(1024, 450)).toBe(450)
  })

  it('collapses from the shared header toggle', async () => {
    const user = userEvent.setup()

    render(
      <>
        <ToolPaneHeaderControls configuration={configuration} />
        <ToolPaneShell
          contextKey="workspace-session:session-1"
          capabilities={{ kind: 'workspace-session', sessionId: 'session-1' }}
          defaultToolId="browser"
          tools={tools}
          showInlineHeaderSwitcher={false}
        >
          <div>Chat</div>
        </ToolPaneShell>
      </>
    )

    await user.click(screen.getByRole('button', { name: 'Browser' }))
    await user.click(screen.getByRole('button', { name: 'Toggle Tool Pane' }))

    expect(screen.queryByRole('complementary', { name: 'Tool Pane' })).not.toBeInTheDocument()
    expect(screen.getByRole('toolbar', { name: 'Tool Switcher' })).toHaveAttribute(
      'aria-orientation',
      'vertical'
    )
  })

  it('starts near sixty percent and persists accessible keyboard resizing', async () => {
    const user = userEvent.setup()

    render(
      <ToolPaneShell
        contextKey="workspace-session:session-1"
        capabilities={{ kind: 'workspace-session', sessionId: 'session-1' }}
        defaultToolId="browser"
        tools={tools}
      >
        <div>Chat</div>
      </ToolPaneShell>
    )

    await user.click(screen.getByRole('button', { name: 'Browser' }))
    const pane = screen.getByRole('complementary', { name: 'Tool Pane' })
    const resizeHandle = screen.getByRole('separator', { name: 'Resize Tool Pane' })

    expect(pane).toHaveStyle({ width: '614px' })
    expect(resizeHandle).toHaveAttribute('aria-valuemin', '400')
    expect(resizeHandle).toHaveAttribute('aria-valuemax', '660')
    expect(resizeHandle).toHaveAttribute('aria-valuenow', '614')

    fireEvent.keyDown(resizeHandle, { key: 'ArrowLeft' })

    expect(pane).toHaveStyle({ width: '638px' })
    expect(useToolPaneStore.getState().contexts['workspace-session:session-1']?.width).toBe(638)

    fireEvent.pointerDown(resizeHandle, { clientX: 500 })
    fireEvent.pointerMove(window, { clientX: 520 })
    fireEvent.pointerUp(window)

    expect(pane).toHaveStyle({ width: '618px' })
    expect(useToolPaneStore.getState().contexts['workspace-session:session-1']?.width).toBe(618)
  })

  it('uses the same shell state from the top-right toggle and header Tool Switcher', async () => {
    const user = userEvent.setup()
    const switchableTools: readonly ToolDescriptor[] = [
      {
        id: 'files',
        label: 'Files',
        available: true,
        icon: () => null,
        render: () => <div>Files content</div>
      },
      ...tools
    ]
    const switchableConfiguration = {
      ...configuration,
      defaultToolId: 'files' as const,
      tools: switchableTools
    }

    render(
      <>
        <ToolPaneHeaderControls configuration={switchableConfiguration} />
        <ToolPaneShell {...switchableConfiguration} showInlineHeaderSwitcher={false}>
          <div>Chat</div>
        </ToolPaneShell>
      </>
    )

    const toggle = screen.getByRole('button', { name: 'Toggle Tool Pane' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')

    await user.click(toggle)
    expect(screen.getByRole('complementary', { name: 'Tool Pane' })).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'Browser' }))
    expect(screen.queryByText('Files content')).not.toBeInTheDocument()
    expect(screen.getByText('Browser for workspace-session:session-1')).toBeInTheDocument()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
  })

  it('keeps unavailable tools visible, disabled, keyboard-inert, and unable to open the pane', async () => {
    const user = userEvent.setup()
    const unavailableConfiguration: ToolPaneConfiguration = {
      ...configuration,
      tools: tools.map((tool) => ({ ...tool, available: false }))
    }

    render(
      <>
        <ToolPaneToggleButton configuration={unavailableConfiguration} />
        <ToolPaneShell {...unavailableConfiguration}>
          <div>Chat</div>
        </ToolPaneShell>
      </>
    )

    const unavailableTool = screen.getByRole('button', { name: 'Browser — Coming soon' })
    expect(unavailableTool).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Toggle Tool Pane' })).toBeDisabled()

    await user.tab()
    expect(unavailableTool).not.toHaveFocus()
    expect(screen.queryByRole('complementary', { name: 'Tool Pane' })).not.toBeInTheDocument()
  })

  it('renders only the selected tool and unmounts the previous tool', async () => {
    const user = userEvent.setup()
    const switchableTools: readonly ToolDescriptor[] = [
      {
        id: 'files',
        label: 'Files',
        available: true,
        icon: () => null,
        render: () => <div>Files content</div>
      },
      ...tools
    ]

    render(
      <ToolPaneShell {...configuration} defaultToolId="files" tools={switchableTools}>
        <div>Chat</div>
      </ToolPaneShell>
    )

    await user.click(screen.getByRole('button', { name: 'Files' }))
    expect(screen.getByText('Files content')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Browser' }))
    expect(screen.queryByText('Files content')).not.toBeInTheDocument()
    expect(screen.getByText('Browser for workspace-session:session-1')).toBeInTheDocument()
  })

  it('rehydrates layout state without leaking it between context keys and falls back from unavailable tools', async () => {
    const fallbackTools: readonly ToolDescriptor[] = [
      {
        id: 'files',
        label: 'Files',
        available: false,
        icon: () => null,
        render: () => <div>Files content</div>
      },
      ...tools
    ]
    useToolPaneStore.setState({
      contexts: {
        'project-session:session-1': { isOpen: true, width: 640, activeToolId: 'files' },
        'project-session:session-2': { isOpen: false, width: 424, activeToolId: 'browser' }
      }
    })
    const persistedState = window.localStorage.getItem('spacezero.toolPane')
    useToolPaneStore.setState({ contexts: {} })
    if (persistedState) window.localStorage.setItem('spacezero.toolPane', persistedState)

    await act(async () => {
      await useToolPaneStore.persist.rehydrate()
    })

    const { rerender } = render(
      <ToolPaneShell
        contextKey="project-session:session-1"
        capabilities={{ kind: 'project-session', projectId: 'project-1', sessionId: 'session-1' }}
        defaultToolId="browser"
        tools={fallbackTools}
      >
        <div>Chat 1</div>
      </ToolPaneShell>
    )

    expect(screen.getByRole('complementary', { name: 'Tool Pane' })).toHaveStyle({ width: '640px' })
    expect(screen.getByText('Browser for project-session:session-1')).toBeInTheDocument()

    rerender(
      <ToolPaneShell
        contextKey="project-session:session-2"
        capabilities={{ kind: 'project-session', projectId: 'project-1', sessionId: 'session-2' }}
        defaultToolId="browser"
        tools={fallbackTools}
      >
        <div>Chat 2</div>
      </ToolPaneShell>
    )

    expect(screen.queryByRole('complementary', { name: 'Tool Pane' })).not.toBeInTheDocument()
    expect(screen.getByRole('toolbar', { name: 'Tool Switcher' })).toHaveAttribute(
      'aria-orientation',
      'vertical'
    )
  })
})
