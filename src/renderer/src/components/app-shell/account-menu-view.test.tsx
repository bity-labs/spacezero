import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AccountMenuView } from './account-menu-view'

const avatarUrl =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"%3E%3C/svg%3E'

describe('AccountMenuView', () => {
  it('renders deterministic account state and emits settings intent', () => {
    const onOpenSettings = vi.fn()

    render(
      <AccountMenuView
        username="@builder"
        avatarUrl={avatarUrl}
        avatarFallback="TB"
        settingsLabel="Settings"
        settingsHref="#/settings?section=account"
        updateControl={<button type="button">Update ready</button>}
        onOpenSettings={onOpenSettings}
      />
    )

    expect(screen.getByRole('region', { name: 'Account menu' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '@builder' })).toHaveAttribute('src', avatarUrl)
    expect(screen.getByRole('link', { name: '@builder' })).toHaveAttribute(
      'href',
      '#/settings?section=account'
    )
    expect(screen.getByRole('button', { name: 'Update ready' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: '@builder' }))
    fireEvent.click(screen.getByRole('link', { name: 'Settings' }))

    expect(onOpenSettings).toHaveBeenCalledTimes(2)
  })

  it('keeps the disconnected fallback accessible and links GitHub connection to account settings', () => {
    const onOpenSettings = vi.fn()

    render(
      <AccountMenuView
        username="Connect GitHub"
        avatarFallback="GH"
        settingsLabel="Settings"
        settingsHref="#/settings?section=account"
        onOpenSettings={onOpenSettings}
      />
    )

    expect(screen.getByRole('link', { name: 'Connect GitHub' })).toHaveAttribute(
      'href',
      '#/settings?section=account'
    )
    expect(screen.queryByRole('img')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: 'Connect GitHub' }))
    expect(onOpenSettings).toHaveBeenCalledOnce()
  })
})
