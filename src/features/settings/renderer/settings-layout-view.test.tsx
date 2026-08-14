import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SettingsLayoutView } from './settings-layout-view'

const labels = {
  backToWorkspace: 'Back to workspace',
  navigation: 'Settings navigation',
  experimentalNavigation: 'Experimental settings',
  main: 'Settings content',
  title: 'Settings',
  resizeSidebar: 'Resize settings sidebar',
  sections: {
    general: 'General',
    models: 'Models',
    account: 'Account',
    appearance: 'Appearance',
    about: 'About',
    agents: 'Agents',
    skills: 'Skills'
  }
}

describe('SettingsLayoutView', () => {
  it('composes the real Settings sidebar and content while emitting navigation intent', () => {
    const onBackToWorkspace = vi.fn()
    const onSelectSection = vi.fn()

    render(
      <SettingsLayoutView
        sidebarWidth={280}
        selectedSection="models"
        accountMenu={<div>Builder account</div>}
        mainContent={<h2>Model providers</h2>}
        labels={labels}
        onBackToWorkspace={onBackToWorkspace}
        onSelectSection={onSelectSection}
        onResizePointerDown={vi.fn()}
        onResizeKeyDown={vi.fn()}
      />
    )

    expect(screen.getByRole('list', { name: 'Settings navigation' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Models' })).toHaveAttribute('data-active')
    expect(screen.getByRole('main', { name: 'Settings content' })).toHaveTextContent(
      'Model providers'
    )
    expect(screen.getByText('Builder account')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: 'Back to workspace' }))
    fireEvent.click(screen.getByRole('link', { name: 'Account' }))

    expect(onBackToWorkspace).toHaveBeenCalledOnce()
    expect(onSelectSection).toHaveBeenCalledWith('account')
  })
})
