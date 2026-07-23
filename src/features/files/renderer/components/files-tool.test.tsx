import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useFilesStore } from '../files-store'
import { FilesTool } from './files-tool'

describe('Files Tool', () => {
  it('loads only the visible directory and lazily expands folders through the Project Session API', async () => {
    const listDirectory = vi.fn(async ({ relativePath }: { relativePath: string }) =>
      relativePath === ''
        ? [
            { name: 'src', relativePath: 'src', kind: 'directory' as const },
            { name: 'README.md', relativePath: 'README.md', kind: 'file' as const }
          ]
        : [{ name: 'index.ts', relativePath: 'src/index.ts', kind: 'file' as const }]
    )
    window.spacezero.files.listDirectory = listDirectory

    render(<FilesTool sessionId="session-1" />)

    expect(screen.getByText('Loading files…')).toBeInTheDocument()
    expect(await screen.findByRole('tree', { name: 'Project files' })).toBeInTheDocument()
    expect(screen.getByText('src')).toBeInTheDocument()
    expect(screen.getByText('README.md')).toBeInTheDocument()
    expect(listDirectory).toHaveBeenCalledTimes(1)
    expect(listDirectory).toHaveBeenCalledWith({ sessionId: 'session-1', relativePath: '' })

    fireEvent.click(screen.getByRole('button', { name: 'Expand src' }))

    expect(await screen.findByText('index.ts')).toBeInTheDocument()
    await waitFor(() =>
      expect(listDirectory).toHaveBeenLastCalledWith({
        sessionId: 'session-1',
        relativePath: 'src'
      })
    )
  })

  it('reloads persisted expanded directories parent-first after remounting', async () => {
    useFilesStore.getState().setExpanded('session-1', 'src', true)
    useFilesStore.getState().setExpanded('session-1', 'src/nested', true)
    const listDirectory = vi.fn(async ({ relativePath }: { relativePath: string }) => {
      if (relativePath === '') {
        return [{ name: 'src', relativePath: 'src', kind: 'directory' as const }]
      }
      if (relativePath === 'src') {
        return [
          { name: 'nested', relativePath: 'src/nested', kind: 'directory' as const }
        ]
      }
      return [{ name: 'index.ts', relativePath: 'src/nested/index.ts', kind: 'file' as const }]
    })
    window.spacezero.files.listDirectory = listDirectory

    render(<FilesTool sessionId="session-1" />)

    expect(await screen.findByText('index.ts')).toBeInTheDocument()
    expect(listDirectory.mock.calls.map(([request]) => request.relativePath)).toEqual([
      '',
      'src',
      'src/nested'
    ])
  })

  it('shows an actionable managed-worktree failure and retries without fabricating content', async () => {
    const listDirectory = vi
      .fn()
      .mockRejectedValueOnce(
        new Error(
          "Error invoking remote method 'files:listDirectory': Error: files.worktreeInvalid"
        )
      )
      .mockResolvedValueOnce([])
    window.spacezero.files.listDirectory = listDirectory

    render(<FilesTool sessionId="session-1" />)

    expect(
      await screen.findByText(
        'This Session’s managed worktree is missing or invalid. Repair or recreate the Session.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByRole('tree', { name: 'Project files' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('This worktree is empty.')).toBeInTheDocument()
    expect(listDirectory).toHaveBeenCalledTimes(2)
  })

  it('does not leak late directory results when switching Project Sessions', async () => {
    let resolveFirst:
      | ((entries: Awaited<ReturnType<typeof window.spacezero.files.listDirectory>>) => void)
      | undefined
    const firstResult = new Promise<
      Awaited<ReturnType<typeof window.spacezero.files.listDirectory>>
    >((resolve) => {
      resolveFirst = resolve
    })
    window.spacezero.files.listDirectory = vi.fn(async ({ sessionId }) =>
      sessionId === 'session-1'
        ? firstResult
        : [{ name: 'second.txt', relativePath: 'second.txt', kind: 'file' as const }]
    )

    const view = render(<FilesTool sessionId="session-1" />)
    view.rerender(<FilesTool sessionId="session-2" />)

    expect(await screen.findByText('second.txt')).toBeInTheDocument()
    resolveFirst?.([{ name: 'first.txt', relativePath: 'first.txt', kind: 'file' }])
    await Promise.resolve()

    expect(screen.queryByText('first.txt')).not.toBeInTheDocument()
    expect(screen.getByText('second.txt')).toBeInTheDocument()
  })

  it('renders symbolic links as identifiable non-expandable entries', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [
      { name: 'linked-src', relativePath: 'linked-src', kind: 'symlink' as const }
    ])

    render(<FilesTool sessionId="session-1" />)

    expect(await screen.findByText('linked-src')).toBeInTheDocument()
    expect(screen.getByText('Symbolic link')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Expand linked-src' })).not.toBeInTheDocument()
  })

  it('keeps the collapsible and keyboard-resizable explorer layout per Project Session', async () => {
    window.spacezero.files.listDirectory = vi.fn(async () => [])
    const view = render(<FilesTool sessionId="session-1" />)
    await screen.findByText('This worktree is empty.')

    const resizeHandle = screen.getByRole('separator', { name: 'Resize Files explorer' })
    expect(resizeHandle).toHaveAttribute('aria-valuenow', '260')
    fireEvent.keyDown(resizeHandle, { key: 'ArrowRight' })
    expect(screen.getByRole('separator', { name: 'Resize Files explorer' })).toHaveAttribute(
      'aria-valuenow',
      '280'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Files explorer' }))
    expect(screen.getByRole('button', { name: 'Expand Files explorer' })).toBeInTheDocument()

    view.rerender(<FilesTool sessionId="session-2" />)
    expect(
      await screen.findByRole('button', { name: 'Collapse Files explorer' })
    ).toBeInTheDocument()
    expect(screen.getByRole('separator', { name: 'Resize Files explorer' })).toHaveAttribute(
      'aria-valuenow',
      '260'
    )

    view.rerender(<FilesTool sessionId="session-1" />)
    expect(screen.getByRole('button', { name: 'Expand Files explorer' })).toBeInTheDocument()
  })
})
