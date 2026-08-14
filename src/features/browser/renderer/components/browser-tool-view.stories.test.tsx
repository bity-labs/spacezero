import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'

import * as stories from './browser-tool-view.stories'

const {
  AddressFocused,
  BackAndForwardDisabled,
  BlankTab,
  DownloadComplete,
  DownloadFailed,
  DownloadInProgress,
  FailedLoad,
  LoadedPageTitleAndFavicon,
  LoadingUrl
} = composeStories(stories)

describe('BrowserToolView stories', () => {
  it('covers the required Browser chrome and download states without an Electron runtime', () => {
    const blank = render(<BlankTab />)
    expect(screen.getByLabelText('Browser URL')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Reload' })).toBeDisabled()
    blank.unmount()

    const loading = render(<LoadingUrl />)
    expect(screen.getByLabelText('Browser URL')).toHaveValue('https://spacezero.dev/docs')
    expect(screen.getByRole('button', { name: 'Stop loading' })).toBeEnabled()
    loading.unmount()

    const loaded = render(<LoadedPageTitleAndFavicon />)
    const loadedTab = screen.getByRole('tab', { name: 'Space Zero Docs' })
    expect(loadedTab.querySelector('img')).toHaveAttribute(
      'src',
      expect.stringContaining('data:image/svg+xml')
    )
    loaded.unmount()

    const failed = render(<FailedLoad />)
    expect(
      screen.getByText('Couldn’t load this page. Check the address and try again.')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled()
    failed.unmount()

    const disabledHistory = render(<BackAndForwardDisabled />)
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Forward' })).toBeDisabled()
    disabledHistory.unmount()

    const focused = render(<AddressFocused />)
    expect(screen.getByLabelText('Browser URL')).toHaveFocus()
    focused.unmount()

    const inProgress = render(<DownloadInProgress />)
    expect(screen.getByLabelText('Browser downloads')).toHaveTextContent('Downloading… 42%')
    inProgress.unmount()

    const complete = render(<DownloadComplete />)
    expect(screen.getByLabelText('Browser downloads')).toHaveTextContent('Download complete.')
    expect(screen.getByRole('button', { name: 'Open' })).toBeEnabled()
    complete.unmount()

    render(<DownloadFailed />)
    expect(screen.getByLabelText('Browser downloads')).toHaveTextContent('Download failed.')
  })
})
