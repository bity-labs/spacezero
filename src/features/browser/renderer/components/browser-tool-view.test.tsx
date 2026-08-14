import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { BrowserToolView, type BrowserToolViewProps } from './browser-tool-view'

const blankTab = {
  id: 'browser-tab-1',
  url: null,
  title: null,
  faviconUrl: null,
  isLoading: false,
  canGoBack: false,
  canGoForward: false,
  error: null
}

const baseProps = {
  activeTab: blankTab,
  address: '',
  downloads: [],
  error: null,
  onAddressChange: vi.fn(),
  onBack: vi.fn(),
  onBrowserFocusChange: vi.fn(),
  onForward: vi.fn(),
  onNavigate: vi.fn(),
  onOpenDownload: vi.fn(),
  onReloadOrStop: vi.fn(),
  onRetry: vi.fn(),
  onRevealDownload: vi.fn()
} satisfies BrowserToolViewProps

describe('BrowserToolView', () => {
  it('renders blank Browser chrome without requiring an app runtime', () => {
    render(<BrowserToolView {...baseProps} />)

    expect(screen.getByRole('region', { name: 'Browser' })).toBeInTheDocument()
    expect(screen.getByLabelText('Browser URL')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Forward' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeDisabled()
    expect(screen.queryByLabelText('Browser downloads')).not.toBeInTheDocument()
  })
})
