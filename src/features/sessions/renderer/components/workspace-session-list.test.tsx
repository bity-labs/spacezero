import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { WorkspaceSession } from '../../shared'
import { WorkspaceSessionList } from './workspace-session-list'

const baseSession: WorkspaceSession = {
  id: 'workspace-session-1',
  kind: 'workspace',
  title: 'Workspace Session 1',
  status: 'idle',
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString()
}

describe('WorkspaceSessionList session rename interactions', () => {
  it('starts with the current title and saves trimmed titles on Enter', async () => {
    const onRenameSession = vi.fn(async () => undefined)
    render(
      <WorkspaceSessionList
        workspaceSessions={[baseSession]}
        status="ready"
        error={null}
        onSelectSession={vi.fn()}
        onRenameSession={onRenameSession}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Rename workspace session' }))
    const input = screen.getByRole('textbox', { name: 'Rename workspace session' })
    expect(input).toHaveValue('Workspace Session 1')

    fireEvent.change(input, { target: { value: '  Renamed Workspace  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() =>
      expect(onRenameSession).toHaveBeenCalledWith(baseSession, 'Renamed Workspace')
    )
  })

  it('cancels with Escape and saves a valid title on blur', async () => {
    const onRenameSession = vi.fn(async () => undefined)
    render(
      <WorkspaceSessionList
        workspaceSessions={[baseSession]}
        status="ready"
        error={null}
        onSelectSession={vi.fn()}
        onRenameSession={onRenameSession}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Rename workspace session' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Canceled title' } })
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })
    expect(onRenameSession).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Rename workspace session' }))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Blur Saved' } })
    fireEvent.blur(input)

    await waitFor(() => expect(onRenameSession).toHaveBeenCalledWith(baseSession, 'Blur Saved'))
  })

  it('rejects whitespace-only titles and preserves the visible title after failure', async () => {
    const onRenameSession = vi.fn(async () => {
      throw new Error('database unavailable')
    })
    render(
      <WorkspaceSessionList
        workspaceSessions={[baseSession]}
        status="ready"
        error={null}
        onSelectSession={vi.fn()}
        onRenameSession={onRenameSession}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Rename workspace session' }))
    const emptyInput = screen.getByRole('textbox')
    fireEvent.change(emptyInput, { target: { value: '   ' } })
    fireEvent.keyDown(emptyInput, { key: 'Enter' })
    expect(onRenameSession).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a Session title before saving.')

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Fails to persist' } })
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })

    await waitFor(() => expect(onRenameSession).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to rename Session. Check the title and try again.'
    )
    expect(screen.getByRole('textbox')).toHaveValue('Workspace Session 1')
  })
})
