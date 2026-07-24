import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AgentsSettingsSection } from './agents-settings-section'

describe('AgentsSettingsSection', () => {
  it('loads global Agent Definitions through typed IPC and opens only global folders', async () => {
    const openedScopes: string[] = []
    window.spacezero.agents.getGlobalDefinitions = async () => [
      {
        id: 'reviewer',
        name: 'Reviewer',
        description: 'Reviews code changes.',
        scope: 'spacezero',
        path: '/Users/tiby/SpaceZero/agents/reviewer.md',
        status: 'valid',
        diagnostics: []
      },
      {
        id: 'scout',
        name: 'Scout',
        description: 'Bundled scout.',
        scope: 'bundled',
        path: 'bundled://agents/scout.md',
        status: 'valid',
        shadowedBy: 'user',
        diagnostics: []
      },
      {
        id: 'broken',
        scope: 'user',
        path: '/Users/tiby/.agents/agents/broken.md',
        status: 'invalid',
        diagnostics: [
          {
            severity: 'error',
            code: 'agentDefinitions.descriptionRequired',
            message: 'Agent Definition description is required.'
          }
        ]
      }
    ]
    window.spacezero.agents.openDefinitionsFolder = async ({ scope }) => {
      openedScopes.push(scope)
    }

    render(<AgentsSettingsSection />)

    expect(await screen.findByText('Reviewer')).toBeInTheDocument()
    expect(screen.getByText('Agent Definition description is required.')).toBeInTheDocument()
    expect(screen.getByText('Shadowed by user')).toBeInTheDocument()

    const openButtons = screen.getAllByRole('button', { name: 'Open agents folder' })
    expect(openButtons).toHaveLength(2)
    fireEvent.click(openButtons[0])

    await waitFor(() => expect(openedScopes).toEqual(['spacezero']))
  })
})
