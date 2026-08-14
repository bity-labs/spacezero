import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { TerminalToolView } from './terminal-tool-view'

const noop = (): void => undefined

const baseProps = {
  diagnostics: [],
  error: null,
  output: [],
  status: 'ready' as const,
  onCancelBrowserFallback: noop,
  onCopyBrowserFallback: noop,
  onNewTerminal: noop,
  onOpenBrowserFallback: noop,
  onOpenLink: noop,
  onRetry: noop
}

describe('TerminalToolView', () => {
  it('renders the starting and ready terminal states without a runtime', () => {
    const mounted = render(<TerminalToolView {...baseProps} status="starting" />)

    expect(screen.getByText('Starting terminal…')).toBeInTheDocument()

    mounted.rerender(<TerminalToolView {...baseProps} />)

    expect(screen.getByRole('status', { name: 'Terminal ready' })).toBeInTheDocument()
    expect(screen.getByLabelText('Terminal output')).toBeInTheDocument()
  })

  it('renders sample output, a running command, and a detected Browser link', () => {
    const onOpenLink = vi.fn()
    render(
      <TerminalToolView
        {...baseProps}
        status="running"
        output={[
          { kind: 'command', content: 'pnpm dev' },
          { kind: 'output', content: 'VITE ready in 412 ms' },
          { kind: 'link', content: 'http://localhost:5173', url: 'http://localhost:5173' }
        ]}
        onOpenLink={onOpenLink}
      />
    )

    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.getByText('$ pnpm dev')).toBeInTheDocument()
    expect(screen.getByText('VITE ready in 412 ms')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open http://localhost:5173 in Browser' }))
    expect(onOpenLink).toHaveBeenCalledWith('http://localhost:5173')
  })

  it('renders failed, unavailable, and empty states with their actions', () => {
    const onRetry = vi.fn()
    const mounted = render(
      <TerminalToolView
        {...baseProps}
        error="Shell process exited before it was ready."
        status="failed"
        onRetry={onRetry}
      />
    )

    expect(screen.getByText('Terminal failed to start')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledOnce()

    mounted.rerender(
      <TerminalToolView
        {...baseProps}
        error="No supported shell executable was found."
        status="unavailable"
      />
    )
    expect(screen.getByText('Terminal unavailable')).toBeInTheDocument()
    expect(screen.getByText('No supported shell executable was found.')).toBeInTheDocument()

    mounted.rerender(<TerminalToolView {...baseProps} status="empty" />)
    expect(screen.getByRole('button', { name: 'New Terminal' })).toBeInTheDocument()
  })

  it('renders diagnostics and Browser fallback choices through callbacks', () => {
    const onCopyBrowserFallback = vi.fn()
    render(
      <TerminalToolView
        {...baseProps}
        browserFallbackUrl="http://localhost:5173"
        diagnostics={['Restored terminal cwd was unavailable; using /workspace.']}
        onCopyBrowserFallback={onCopyBrowserFallback}
      />
    )

    expect(screen.getByText(/Restored terminal cwd was unavailable/)).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Terminal Link choices' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Copy URL' }))
    expect(onCopyBrowserFallback).toHaveBeenCalledOnce()
  })
})
