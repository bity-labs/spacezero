import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import type { ProjectSession } from '../../features/sessions/shared'
import type { ModelDefaults, ThinkingLevel } from '@shared/model-settings'

import { App } from './App'
import { router } from './router'

describe('App', () => {
  beforeEach(async () => {
    window.location.hash = ''
    await router.navigate({ to: '/' })
    document.documentElement.classList.remove('dark')
    document.documentElement.style.colorScheme = ''
  })

  it('renders the workspace route at /', async () => {
    render(<App />)

    expect(await screen.findByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Left panel' })).toBeInTheDocument()
    expect(screen.getByRole('main', { name: 'Main workspace' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Right panel' })).toBeInTheDocument()
    expect(screen.queryByText('Desktop foundation')).not.toBeInTheDocument()
  })

  it('toggles the side columns from the top bar corner buttons', async () => {
    render(<App />)

    const topBar = await screen.findByRole('banner')
    fireEvent.click(within(topBar).getByRole('button', { name: 'Hide left panel' }))
    fireEvent.click(within(topBar).getByRole('button', { name: 'Hide right panel' }))

    expect(screen.queryByRole('complementary', { name: 'Left panel' })).not.toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Right panel' })).not.toBeInTheDocument()
    expect(within(topBar).getByRole('button', { name: 'Show left panel' })).toBeInTheDocument()
    expect(within(topBar).getByRole('button', { name: 'Show right panel' })).toBeInTheDocument()
  })

  it('does not render a theme toggle in the titlebar', async () => {
    render(<App />)

    const topBar = await screen.findByRole('banner')
    expect(
      within(topBar)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label'))
    ).toEqual(['Hide left panel', 'Open command palette', 'Hide right panel'])
    expect(within(topBar).queryByRole('button', { name: /Switch to/ })).not.toBeInTheDocument()
  })

  it('shows Projects in the sidebar with empty state and add setup paths', async () => {
    render(<App />)

    expect(await screen.findByText('Projects')).toBeInTheDocument()
    expect(screen.queryByText('Repositories')).not.toBeInTheDocument()
    expect(screen.getByText('No projects yet.')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Add project' })[0])

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Empty Project')).toBeInTheDocument()
    expect(screen.getByText('Open Folder')).toBeInTheDocument()
    expect(screen.getByText('Git Repository URL')).toBeInTheDocument()
    expect(screen.getByText('Coming soon')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create project' })).toBeDisabled()
  })

  it('creates an empty project and selects it in the workspace', async () => {
    const projects: Array<{
      id: string
      name: string
      path: string
      createdAt: string
      updatedAt: string
    }> = []
    window.spacezero.projects.list = async () => projects
    window.spacezero.projects.createEmpty = async ({ name }) => {
      const project = {
        id: 'project-1',
        name,
        path: '/tmp/agent-workspace',
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      }
      projects.push(project)
      return project
    }

    render(<App />)

    fireEvent.click((await screen.findAllByRole('button', { name: 'Add project' }))[0])
    fireEvent.change(await screen.findByLabelText('Project name'), {
      target: { value: 'Agent Workspace' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }))

    expect(await screen.findByRole('button', { name: 'Agent Workspace' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'breadcrumb' })).toHaveTextContent('Agent Workspace')
    expect(screen.queryByText('/tmp/agent-workspace')).not.toBeInTheDocument()
  })

  it('shows persisted project sessions, creates a new session, and restores metadata after reload', async () => {
    const projects = [
      {
        id: 'project-1',
        name: 'Space Zero',
        path: '/Users/tiby/ws/dev/spacezero',
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      }
    ]
    const sessions: ProjectSession[] = [
      {
        id: 'session-1',
        projectId: 'project-1',
        title: 'Session 1',
        status: 'running' as const,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      }
    ]
    window.spacezero.projects.list = async () => projects
    window.spacezero.sessions.listProjectSessions = async () => sessions
    window.spacezero.agent.createSession = async ({ projectId, cwd }) => {
      const session = {
        id: 'session-2',
        projectId,
        title: 'Session 2',
        status: 'idle' as const,
        createdAt: new Date(1).toISOString(),
        updatedAt: new Date(1).toISOString()
      }
      sessions.push(session)
      return {
        sessionId: session.id,
        projectId,
        cwd,
        status: session.status,
        live: true,
        transcriptPath: '/tmp/agent-session-2.jsonl',
        modelProvider: 'faux',
        modelId: 'faux-1'
      }
    }

    const rendered = render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Space Zero' }))
    expect(await screen.findByRole('button', { name: /Session 1/ })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Running' })).toBeInTheDocument()
    expect(screen.getByText('No session open for Space Zero')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'New Session' }))

    expect(await screen.findByText('Ask the agent to work on this project. Streamed replies appear here.')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'breadcrumb' })).toHaveTextContent('Space ZeroSession 2')

    rendered.unmount()
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Space Zero' }))
    expect(await screen.findByRole('button', { name: /Session 1/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Session 2/ })).toBeInTheDocument()
  })

  it('opens one focused AgentChat for the selected project session', async () => {
    const projects = [
      {
        id: 'project-1',
        name: 'Space Zero',
        path: '/Users/tiby/ws/dev/spacezero',
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      }
    ]
    window.spacezero.projects.list = async () => projects
    window.spacezero.sessions.listProjectSessions = async () => [
      {
        id: 'session-1',
        projectId: 'project-1',
        title: 'Session 1',
        status: 'running',
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      },
      {
        id: 'session-2',
        projectId: 'project-1',
        title: 'Session 2',
        status: 'idle',
        createdAt: new Date(1).toISOString(),
        updatedAt: new Date(1).toISOString()
      },
      {
        id: 'session-3',
        projectId: 'project-1',
        title: 'Session 3',
        status: 'idle',
        createdAt: new Date(2).toISOString(),
        updatedAt: new Date(2).toISOString()
      }
    ]

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Space Zero' }))
    fireEvent.click(await screen.findByRole('button', { name: /Session 1/ }))

    expect(
      screen.getByText('Ask the agent to work on this project. Streamed replies appear here.')
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Space Zero → Session 1' })).not.toBeInTheDocument()
    expect(screen.queryByText('Working directory')).not.toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'breadcrumb' })).toHaveTextContent('Space ZeroSession 1')

    fireEvent.click(screen.getByRole('button', { name: /Session 2/ }))

    expect(
      screen.getByText('Ask the agent to work on this project. Streamed replies appear here.')
    ).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it('opens a global Workspace Session without selecting a project', async () => {
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'New Agent' }))

    expect(screen.getAllByText('Workspace Session').length).toBeGreaterThan(0)
    expect(
      screen.getByText(
        'Workspace Session host for the global Space Zero agent. This surface does not require a project, cwd, or repository path.'
      )
    ).toBeInTheDocument()
    expect(screen.getByText('workspace.getStatus.preview')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'breadcrumb' })).toHaveTextContent(
      'WorkspaceWorkspace Session'
    )
    expect(screen.queryByText('Project ID')).not.toBeInTheDocument()
    expect(screen.queryByText('Working directory')).not.toBeInTheDocument()
  })

  it('loads persisted projects, opens them, and edits project metadata', async () => {
    let projects = [
      {
        id: 'project-1',
        name: 'Space Zero',
        path: '/Users/tiby/ws/dev/spacezero',
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      }
    ]
    window.spacezero.projects.list = async () => projects
    window.spacezero.projects.update = async (request) => {
      const updated = {
        ...projects[0],
        name: request.name,
        path: request.path,
        updatedAt: new Date(1).toISOString()
      }
      projects = [updated]
      return updated
    }

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Space Zero' }))
    expect(screen.getByRole('navigation', { name: 'breadcrumb' })).toHaveTextContent('Space Zero')

    fireEvent.click(screen.getByRole('button', { name: 'Edit Space Zero' }))
    fireEvent.change(await screen.findByLabelText('Project name'), {
      target: { value: 'Space Zero Desktop' }
    })
    fireEvent.change(screen.getByLabelText('Project path'), {
      target: { value: '/Users/tiby/ws/dev/spacezero-desktop' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('button', { name: 'Space Zero Desktop' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'breadcrumb' })).toHaveTextContent('Space Zero Desktop')
    expect(screen.queryByText('/Users/tiby/ws/dev/spacezero-desktop')).not.toBeInTheDocument()
  })

  it('supports keyboard resizing for side columns', async () => {
    render(<App />)

    await screen.findByRole('banner')
    const leftResize = screen.getByRole('separator', { name: 'Resize left panel' })
    const rightResize = screen.getByRole('separator', { name: 'Resize right panel' })

    expect(leftResize).toHaveAttribute('aria-valuenow', '280')
    expect(rightResize).toHaveAttribute('aria-valuenow', '320')

    fireEvent.keyDown(leftResize, { key: 'ArrowRight' })
    fireEvent.keyDown(rightResize, { key: 'ArrowLeft' })

    expect(leftResize).toHaveAttribute('aria-valuenow', '304')
    expect(rightResize).toHaveAttribute('aria-valuenow', '344')
  })

  it('keeps the left sidebar width in sync between workspace and Settings', async () => {
    render(<App />)

    await screen.findByRole('banner')
    fireEvent.keyDown(screen.getByRole('separator', { name: 'Resize left panel' }), {
      key: 'ArrowRight'
    })

    fireEvent.click(screen.getByRole('link', { name: 'Open app settings' }))

    expect(await screen.findByRole('main', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('separator', { name: 'Resize left panel' })).toHaveAttribute(
      'aria-valuenow',
      '304'
    )

    fireEvent.keyDown(screen.getByRole('separator', { name: 'Resize left panel' }), {
      key: 'ArrowRight'
    })
    fireEvent.click(screen.getByRole('link', { name: 'Back to Workspace' }))

    expect(await screen.findByRole('main', { name: 'Main workspace' })).toBeInTheDocument()
    expect(screen.getByRole('separator', { name: 'Resize left panel' })).toHaveAttribute(
      'aria-valuenow',
      '328'
    )
  })

  it('navigates from the workspace to Settings and back', async () => {
    render(<App />)

    fireEvent.click(await screen.findByRole('link', { name: 'Open app settings' }))

    expect(await screen.findByRole('main', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#/settings')

    fireEvent.click(screen.getByRole('link', { name: 'Back to Workspace' }))

    expect(await screen.findByRole('main', { name: 'Main workspace' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'breadcrumb' })).toHaveTextContent('Workspace')
    expect(window.location.hash).toBe('#/')
  })

  it('toggles back to the workspace from the Settings account button', async () => {
    render(<App />)

    fireEvent.click(await screen.findByRole('link', { name: 'Open app settings' }))
    expect(await screen.findByRole('main', { name: 'Settings' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: 'Close settings' }))

    expect(await screen.findByRole('main', { name: 'Main workspace' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#/')
  })

  it('shows only implemented Settings categories and defaults to General', async () => {
    render(<App />)

    fireEvent.click(await screen.findByRole('link', { name: 'Open app settings' }))

    expect(await screen.findByRole('heading', { name: 'General' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'General' })).toHaveAttribute('data-active')
    expect(screen.getByRole('link', { name: 'Models' })).toBeInTheDocument()
    expect(screen.queryByText('Profile')).not.toBeInTheDocument()
    expect(screen.queryByText('Appearance')).not.toBeInTheDocument()
    expect(screen.queryByText('Agents')).not.toBeInTheDocument()
    expect(screen.queryByText('Cloud Agents')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Language' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Theme' })).toBeInTheDocument()
    expect(screen.queryByText('Space Zero Account')).not.toBeInTheDocument()
    expect(screen.queryByText('Pull Requests')).not.toBeInTheDocument()
    expect(screen.queryByText('Notifications')).not.toBeInTheDocument()
    expect(window.location.hash).toBe('#/settings')
  })

  it('deep-links to the Models Settings section and returns to General when the section is missing', async () => {
    await act(async () => {
      await router.navigate({ to: '/settings' })
    })
    render(<App />)

    fireEvent.click(await screen.findByRole('link', { name: 'Models' }))

    expect(await screen.findByRole('heading', { name: 'Models' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Models' })).toHaveAttribute('data-active')
    expect(screen.getByRole('heading', { name: 'Subscriptions' })).toBeInTheDocument()
    expect(screen.getByText('No subscriptions connected.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'API Keys' })).toBeInTheDocument()
    expect(screen.getByText('No API keys configured.')).toBeInTheDocument()
    expect(screen.getByText('Defaults')).toBeInTheDocument()
    expect(screen.getByText('Available Models')).toBeInTheDocument()
    expect(window.location.hash).toBe('#/settings?section=models')

    await act(async () => {
      await router.navigate({ to: '/settings' })
    })

    expect(await screen.findByRole('heading', { name: 'General' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'General' })).toHaveAttribute('data-active')
    expect(screen.getByRole('combobox', { name: 'Language' })).toBeInTheDocument()
  })

  it('keeps model auth actions disabled until the real auth broker is implemented', async () => {
    await act(async () => {
      await router.navigate({ to: '/settings', search: { section: 'models' } })
    })
    render(<App />)

    expect(await screen.findByRole('button', { name: 'Add subscription' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add API key' })).toBeDisabled()
    expect(screen.getAllByText('Coming soon')).toHaveLength(2)
    expect(screen.getByText('No subscriptions connected.')).toBeInTheDocument()
    expect(screen.getByText('No API keys configured.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Add subscription' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Add API key' })).not.toBeInTheDocument()
  })

  it('shows disabled defaults and available-model states until authentication unlocks models', async () => {
    await act(async () => {
      await router.navigate({ to: '/settings', search: { section: 'models' } })
    })
    render(<App />)

    expect(
      await screen.findByText(
        'Configure credentials through environment variables to choose a default model. In-app auth setup is coming soon.'
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Configure credentials through environment variables to browse available models. In-app auth setup is coming soon.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Browse models' })).not.toBeInTheDocument()
  })

  it('summarizes available models, browses them, and makes a model the default', async () => {
    const availableModels = [
      {
        providerId: 'anthropic',
        providerLabel: 'Anthropic',
        modelId: 'claude-sonnet-4',
        modelLabel: 'Claude Sonnet 4',
        description: 'Balanced Claude model',
        supportsThinking: true
      },
      {
        providerId: 'anthropic',
        providerLabel: 'Anthropic',
        modelId: 'claude-opus-4',
        modelLabel: 'Claude Opus 4',
        supportsThinking: true
      },
      {
        providerId: 'openai',
        providerLabel: 'OpenAI',
        modelId: 'gpt-5',
        modelLabel: 'GPT-5',
        supportsThinking: true
      }
    ]
    let modelDefaults: ModelDefaults = { defaultThinking: 'medium' }

    window.spacezero.agent.getAvailableModels = async () => availableModels
    window.spacezero.settings.getModelDefaults = async () => modelDefaults
    window.spacezero.settings.updateModelDefaults = async (request) => {
      modelDefaults = { ...modelDefaults, ...request }
      return modelDefaults
    }

    await act(async () => {
      await router.navigate({ to: '/settings', search: { section: 'models' } })
    })
    render(<App />)

    expect(await screen.findByText('3 models available from 2 providers')).toBeInTheDocument()
    expect(screen.getByText('Anthropic')).toBeInTheDocument()
    expect(screen.getByText('2 models')).toBeInTheDocument()
    expect(screen.getByText('OpenAI')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Browse models' }))
    const browser = await screen.findByRole('dialog', { name: 'Browse models' })
    fireEvent.change(within(browser).getByLabelText('Search models'), {
      target: { value: 'openai' }
    })

    expect(within(browser).getByText('GPT-5')).toBeInTheDocument()
    expect(within(browser).queryByText('Claude Sonnet 4')).not.toBeInTheDocument()

    fireEvent.click(within(browser).getByRole('button', { name: 'Make default' }))

    expect(await within(browser).findByText('Default')).toBeInTheDocument()
    fireEvent.click(within(browser).getByRole('button', { name: 'Close' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Browse models' })).not.toBeInTheDocument()
    )
    expect(screen.getByRole('button', { name: 'OpenAI · GPT-5' })).toBeInTheDocument()
  })

  it('updates default thinking from Models Settings', async () => {
    window.spacezero.agent.getAvailableModels = async () => [
      {
        providerId: 'anthropic',
        providerLabel: 'Anthropic',
        modelId: 'claude-sonnet-4',
        modelLabel: 'Claude Sonnet 4'
      }
    ]

    let savedThinking: ThinkingLevel = 'medium'
    window.spacezero.settings.getModelDefaults = async () => ({ defaultThinking: savedThinking })
    window.spacezero.settings.updateModelDefaults = async (request) => {
      if (request.defaultThinking) savedThinking = request.defaultThinking
      return { defaultThinking: savedThinking }
    }

    await act(async () => {
      await router.navigate({ to: '/settings', search: { section: 'models' } })
    })
    render(<App />)

    const thinkingSelect = await screen.findByRole('combobox', { name: 'Default thinking' })
    fireEvent.click(thinkingSelect)
    const highOption = await screen.findByRole('option', { name: 'High' })
    fireEvent.pointerDown(highOption)
    fireEvent.pointerUp(highOption)
    fireEvent.click(highOption)

    expect(await screen.findByRole('combobox', { name: 'Default thinking' })).toHaveTextContent(
      'High'
    )
  })

  it('opens the command palette, searches, and invokes a navigation command', async () => {
    render(<App />)

    const topBar = await screen.findByRole('banner')
    fireEvent.click(within(topBar).getByRole('button', { name: 'Open command palette' }))

    const palette = await screen.findByRole('dialog', { name: 'Command Palette' })
    const input = within(palette).getByRole('combobox', { name: 'Search commands' })
    fireEvent.change(input, { target: { value: 'settings' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(await screen.findByRole('main', { name: 'Settings' })).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Command Palette' })).not.toBeInTheDocument()
    )
  })

  it('invokes renderer-local workspace UI commands from the command palette', async () => {
    render(<App />)

    const topBar = await screen.findByRole('banner')
    fireEvent.click(within(topBar).getByRole('button', { name: 'Open command palette' }))

    const input = await screen.findByRole('combobox', { name: 'Search commands' })
    fireEvent.change(input, { target: { value: 'right panel' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(screen.queryByRole('complementary', { name: 'Right panel' })).not.toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Command Palette' })).not.toBeInTheDocument()
    )
  })

  it('does not open the command palette through a hard-coded keyboard shortcut', async () => {
    render(<App />)

    await screen.findByRole('banner')
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })

    expect(screen.queryByRole('dialog', { name: 'Command Palette' })).not.toBeInTheDocument()
  })

  it('toggles the workspace left panel through the app command keyboard shortcut', async () => {
    render(<App />)

    await screen.findByRole('banner')
    expect(screen.getByRole('complementary', { name: 'Left panel' })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'b', ctrlKey: true })

    expect(screen.queryByRole('complementary', { name: 'Left panel' })).not.toBeInTheDocument()
  })

  it('updates the language from Settings without requiring a restart', async () => {
    render(<App />)

    fireEvent.click(await screen.findByRole('link', { name: 'Open app settings' }))
    const languageSelect = await screen.findByRole('combobox', { name: 'Language' })

    fireEvent.click(languageSelect)
    const frenchOption = await screen.findByRole('option', { name: 'French' })
    fireEvent.pointerDown(frenchOption)
    fireEvent.pointerUp(frenchOption)
    fireEvent.click(frenchOption)

    expect(await screen.findByRole('heading', { name: 'Paramètres' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Général' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Langue' })).toHaveTextContent('Français')
    expect(screen.getByRole('combobox', { name: 'Thème' })).toBeInTheDocument()
    expect(screen.queryByText('Compte Space Zero')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: 'Retour à l’espace de travail' }))
    expect(
      await screen.findByRole('main', { name: 'Espace de travail principal' })
    ).toBeInTheDocument()
    expect(screen.getByText('Nouvel agent')).toBeInTheDocument()
    expect(screen.getByText('Projets')).toBeInTheDocument()
  })

  it('updates the theme from Settings without requiring a restart', async () => {
    render(<App />)

    fireEvent.click(await screen.findByRole('link', { name: 'Open app settings' }))
    const themeSelect = await screen.findByRole('combobox', { name: 'Theme' })

    expect(themeSelect).toHaveTextContent('System')
    expect(document.documentElement).not.toHaveClass('dark')
    expect(document.documentElement).toHaveStyle({ colorScheme: 'light' })

    fireEvent.click(themeSelect)
    const darkOption = await screen.findByRole('option', { name: 'Dark' })
    fireEvent.pointerDown(darkOption)
    fireEvent.pointerUp(darkOption)
    fireEvent.click(darkOption)

    await waitFor(() => expect(document.documentElement).toHaveClass('dark'))
    expect(themeSelect).toHaveTextContent('Dark')
    expect(themeSelect).not.toHaveTextContent('dark')
    expect(document.documentElement).toHaveStyle({ colorScheme: 'dark' })

    fireEvent.click(screen.getByRole('link', { name: 'Back to Workspace' }))
    expect(await screen.findByRole('main', { name: 'Main workspace' })).toBeInTheDocument()
    expect(document.documentElement).toHaveClass('dark')
  })

  it('follows OS color scheme changes when Theme is System', async () => {
    render(<App />)

    await screen.findByRole('banner')
    expect(document.documentElement).not.toHaveClass('dark')
    expect(document.documentElement).toHaveStyle({ colorScheme: 'light' })

    act(() => window.setTestPrefersDark?.(true))

    expect(document.documentElement).toHaveClass('dark')
    expect(document.documentElement).toHaveStyle({ colorScheme: 'dark' })
  })
})
