import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import type { AgentGlobalSkill } from '../../features/agent-workspace/shared/agent-skill.model'
import type { BrowserClearDataResult } from '../../features/browser/shared'
import type { ProjectSession } from '../../features/sessions/shared'
import type { UpdateStatus } from '../../features/updates/shared'
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

  it('skips first-run GitHub onboarding once and persists completion', async () => {
    let completed = false
    window.spacezero.onboarding.getStatus = async () => ({ completed })
    window.spacezero.onboarding.complete = async () => {
      completed = true
      return { completed: true }
    }

    const firstLaunch = render(<App />)

    expect(await screen.findByRole('main', { name: 'Space Zero onboarding' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Skip for now' }))
    expect(await screen.findByRole('main', { name: 'Main workspace' })).toBeInTheDocument()

    firstLaunch.unmount()
    render(<App />)
    expect(await screen.findByRole('main', { name: 'Main workspace' })).toBeInTheDocument()
    expect(screen.queryByRole('main', { name: 'Space Zero onboarding' })).not.toBeInTheDocument()
  })

  it('composes GitHub connection and one Project setup without starting a Session', async () => {
    let completed = false
    let createSessionCalls = 0
    const repository = {
      id: '1000',
      nodeId: 'R_1000',
      installationId: '100',
      owner: 'bity-labs',
      name: 'spacezero',
      fullName: 'bity-labs/spacezero',
      isPrivate: true,
      defaultBranch: 'main',
      htmlUrl: 'https://github.com/bity-labs/spacezero',
      cloneUrl: 'https://github.com/bity-labs/spacezero.git'
    }
    const project = {
      id: 'project-1',
      name: 'spacezero',
      path: '/tmp/SpaceZero/projects/bity-labs/spacezero',
      githubRepository: {
        repositoryId: '1000',
        nodeId: 'R_1000',
        owner: 'bity-labs',
        name: 'spacezero',
        fullName: 'bity-labs/spacezero',
        htmlUrl: 'https://github.com/bity-labs/spacezero',
        linkedAt: new Date(0).toISOString()
      },
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString()
    }
    window.spacezero.onboarding.getStatus = async () => ({ completed })
    window.spacezero.onboarding.complete = async () => {
      completed = true
      return { completed: true }
    }
    window.spacezero.github.getConnection = async () => ({
      status: 'connected',
      identity: {
        id: '42',
        login: 'octocat',
        avatarUrl: 'https://avatars.githubusercontent.com/u/42?v=4',
        profileUrl: 'https://github.com/octocat'
      },
      installations: [],
      repositories: [repository]
    })
    window.spacezero.github.listRepositorySetupOptions = async () => [
      { repository, existingProject: { id: 'project-1', name: 'spacezero' } }
    ]
    window.spacezero.github.startClone = async () => ({
      status: 'already-added',
      projectId: 'project-1'
    })
    window.spacezero.projects.list = async () => [project]
    window.spacezero.agent.createSession = async (request) => {
      createSessionCalls += 1
      return {
        sessionId: 'unexpected',
        kind: 'project',
        projectId: request.projectId,
        cwd: request.cwd,
        status: 'idle',
        live: true,
        transcriptPath: undefined,
        modelProvider: 'faux',
        modelId: 'faux-1'
      }
    }

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Get started' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Set up a Project' }))
    fireEvent.click(await screen.findByRole('radio', { name: /bity-labs\/spacezero/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Project' }))

    expect(await screen.findByText('Project Home')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'spacezero' })).toBeInTheDocument()
    expect(createSessionCalls).toBe(0)
  })

  it('renders the workspace route at /', async () => {
    render(<App />)

    expect(await screen.findByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Left panel' })).toBeInTheDocument()
    expect(screen.getByRole('main', { name: 'Main workspace' })).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Tool Pane' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Toggle Tool Pane' })).toBeDisabled()
    expect(screen.queryByText('Right panel')).not.toBeInTheDocument()
    expect(screen.queryByText('Desktop foundation')).not.toBeInTheDocument()
  })

  it('shows the connected GitHub identity in the sidebar account area', async () => {
    window.spacezero.github.getConnection = async () => ({
      status: 'connected',
      identity: {
        id: '42',
        login: 'octocat',
        avatarUrl: 'https://avatars.githubusercontent.com/u/42?v=4',
        profileUrl: 'https://github.com/octocat'
      },
      installations: [],
      repositories: []
    })

    render(<App />)

    expect(await screen.findByText('@octocat')).toBeInTheDocument()
    expect(screen.queryByText('Guest')).not.toBeInTheDocument()
  })

  it('toggles the left column and cannot open an empty Tool Pane', async () => {
    render(<App />)

    const topBar = await screen.findByRole('banner')
    fireEvent.click(within(topBar).getByRole('button', { name: 'Hide left panel' }))

    expect(screen.queryByRole('complementary', { name: 'Left panel' })).not.toBeInTheDocument()
    expect(within(topBar).getByRole('button', { name: 'Show left panel' })).toBeInTheDocument()
    expect(within(topBar).getByRole('button', { name: 'Toggle Tool Pane' })).toBeDisabled()
    expect(screen.queryByRole('complementary', { name: 'Tool Pane' })).not.toBeInTheDocument()
  })

  it('does not render a theme toggle in the titlebar', async () => {
    render(<App />)

    const topBar = await screen.findByRole('banner')
    expect(
      within(topBar)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label'))
    ).toEqual(['Hide left panel', 'Open command palette', 'Toggle Tool Pane'])
    expect(within(topBar).queryByRole('button', { name: /Switch to/ })).not.toBeInTheDocument()
  })

  it('shows one Chat item near Knowledge Base without ordinary Workspace Session product APIs', async () => {
    render(<App />)

    const navigation = await screen.findByRole('menu', { name: 'Workspace navigation' })
    const navigationItems = within(navigation).getAllByRole('button')
    expect(navigationItems.map((item) => item.textContent)).toEqual(['Knowledge Base', 'Chat'])
    expect(screen.queryByText('Workspace Sessions')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New Agent' })).not.toBeInTheDocument()
    expect('listWorkspaceSessions' in window.spacezero.sessions).toBe(false)
    expect('createWorkspaceSession' in window.spacezero.agent).toBe(false)

    fireEvent.click(within(navigation).getByRole('button', { name: 'Chat' }))

    expect(await screen.findByPlaceholderText('Ask about Space Zero…')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'breadcrumb' })).toHaveTextContent('Chat')
    const toolSwitcher = screen.getByRole('toolbar', { name: 'Tool Switcher' })
    expect(within(toolSwitcher).getByRole('button', { name: 'Browser' })).toBeEnabled()
    expect(within(toolSwitcher).getByRole('button', { name: 'Terminal' })).toBeEnabled()
    expect(within(toolSwitcher).queryByRole('button', { name: 'Files' })).not.toBeInTheDocument()
    expect(within(toolSwitcher).queryByRole('button', { name: 'Git' })).not.toBeInTheDocument()
  })

  it('opens Files in the Tool Pane while keeping configured Knowledge Base chat primary', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })

    render(<App />)
    fireEvent.click(
      within(await screen.findByRole('menu', { name: 'Workspace navigation' })).getByRole(
        'button',
        { name: 'Knowledge Base' }
      )
    )

    expect(await screen.findByPlaceholderText('Ask about your Knowledge Base…')).toBeInTheDocument()
    expect(await screen.findByRole('complementary', { name: 'Tool Pane' })).toBeInTheDocument()
    expect(screen.getByRole('toolbar', { name: 'Tool Switcher' })).toHaveAttribute(
      'aria-orientation',
      'horizontal'
    )
    expect(screen.getByRole('button', { name: 'Files' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Browser' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Terminal' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Git' })).toBeEnabled()
  })

  it('hides project session breadcrumb context while Knowledge Base is active and restores it after returning', async () => {
    window.spacezero.projects.list = async () => [
      {
        id: 'project-1',
        name: 'Space Zero',
        path: '/Users/tiby/ws/dev/spacezero',
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      }
    ]
    window.spacezero.sessions.listProjectSessions = async () => [
      {
        id: 'session-1',
        kind: 'project',
        projectId: 'project-1',
        title: 'Issue #120: Breadcrumb fix',
        status: 'idle',
        source: {
          type: 'issue',
          repositoryId: '1000',
          repositoryNodeId: 'R_1000',
          repositoryOwner: 'bity-labs',
          repositoryName: 'spacezero',
          repositoryFullName: 'bity-labs/spacezero',
          number: 120,
          url: 'https://github.com/bity-labs/spacezero/issues/120',
          title: 'Breadcrumb fix'
        },
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      }
    ]

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Space Zero' }))
    fireEvent.click(await screen.findByRole('button', { name: /Issue #120: Breadcrumb fix/ }))
    expect(screen.getByRole('navigation', { name: 'breadcrumb' })).toHaveTextContent(
      'Space ZeroIssue #120: Breadcrumb fixIssue #120'
    )

    fireEvent.click(
      within(screen.getByRole('menu', { name: 'Workspace navigation' })).getByRole('button', {
        name: 'Knowledge Base'
      })
    )
    expect(
      await screen.findByRole('heading', { name: 'Set up your Knowledge Base' })
    ).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'breadcrumb' })).toHaveTextContent(
      /^Knowledge Base$/
    )

    fireEvent.click(screen.getByRole('button', { name: /Issue #120: Breadcrumb fix/ }))
    expect(screen.getByRole('navigation', { name: 'breadcrumb' })).toHaveTextContent(
      'Space ZeroIssue #120: Breadcrumb fixIssue #120'
    )
  })

  it('shows Projects in the sidebar with empty state and add setup paths', async () => {
    let repositorySetupFetches = 0
    window.spacezero.github.listRepositorySetupOptions = async () => {
      repositorySetupFetches += 1
      return []
    }

    render(<App />)

    expect(await screen.findByText('Projects')).toBeInTheDocument()
    expect(screen.queryByText('Repositories')).not.toBeInTheDocument()
    expect(screen.getByText('No projects yet.')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Add project' })[0])

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Empty Project')).toBeInTheDocument()
    expect(screen.getByText('Open Folder')).toBeInTheDocument()
    expect(screen.getByText('GitHub Repository')).toBeInTheDocument()
    expect(screen.queryByText('Coming soon')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create project' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /GitHub Repository/ }))
    expect(await screen.findByText('No accessible repositories')).toBeInTheDocument()
    const settingsLink = screen.getByRole('link', { name: 'Configure GitHub repository access' })
    expect(settingsLink).toHaveAttribute('href', '#/settings?section=account')
    expect(repositorySetupFetches).toBe(1)

    fireEvent.click(settingsLink)
    expect(await screen.findByRole('heading', { name: 'Account' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#/settings?section=account')

    fireEvent.click(screen.getByRole('link', { name: 'Back to Workspace' }))
    expect(await screen.findByRole('main', { name: 'Main workspace' })).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Add project' })[0])
    fireEvent.click(await screen.findByRole('button', { name: /GitHub Repository/ }))
    expect(await screen.findByText('No accessible repositories')).toBeInTheDocument()
    expect(repositorySetupFetches).toBe(2)
  })

  it('opens a cloned GitHub Project Home without starting a Session', async () => {
    const repository = {
      id: '1000',
      nodeId: 'R_1000',
      installationId: '100',
      owner: 'bity-labs',
      name: 'spacezero',
      fullName: 'bity-labs/spacezero',
      isPrivate: true,
      defaultBranch: 'main',
      htmlUrl: 'https://github.com/bity-labs/spacezero',
      cloneUrl: 'https://github.com/bity-labs/spacezero.git'
    }
    let projects: Array<{
      id: string
      name: string
      path: string
      githubRepository?: {
        repositoryId: string
        nodeId: string
        owner: string
        name: string
        fullName: string
        htmlUrl: string
        linkedAt: string
      }
      createdAt: string
      updatedAt: string
    }> = []
    let progressListener: Parameters<typeof window.spacezero.github.onCloneProgress>[0] | undefined
    window.spacezero.projects.list = async () => projects
    window.spacezero.github.listRepositorySetupOptions = async () => [{ repository }]
    window.spacezero.github.onCloneProgress = (listener) => {
      progressListener = listener
      return () => undefined
    }
    window.spacezero.github.startClone = async () => ({
      status: 'started',
      operationId: 'clone-1'
    })
    window.spacezero.github.getConnection = async () => ({ status: 'disconnected' })

    render(<App />)

    fireEvent.click((await screen.findAllByRole('button', { name: 'Add project' }))[0])
    fireEvent.click(screen.getByRole('button', { name: /GitHub Repository/ }))
    fireEvent.click(await screen.findByRole('radio', { name: /bity-labs\/spacezero/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Clone repository' }))
    await screen.findByText('Preparing managed clone…')

    projects = [
      {
        id: 'project-1',
        name: 'spacezero',
        path: '/tmp/SpaceZero/projects/bity-labs/spacezero',
        githubRepository: {
          repositoryId: '1000',
          nodeId: 'R_1000',
          owner: 'bity-labs',
          name: 'spacezero',
          fullName: 'bity-labs/spacezero',
          htmlUrl: 'https://github.com/bity-labs/spacezero',
          linkedAt: new Date(0).toISOString()
        },
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      }
    ]
    act(() =>
      progressListener?.({
        operationId: 'clone-1',
        status: 'complete',
        message: 'Repository cloned and Project added.',
        projectId: 'project-1'
      })
    )

    expect(await screen.findByText('Project Home')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'spacezero' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Conversation' })).not.toBeInTheDocument()
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
    expect(screen.getByRole('navigation', { name: 'breadcrumb' })).toHaveTextContent(
      'Agent Workspace'
    )
    expect(screen.queryByText('/tmp/agent-workspace')).not.toBeInTheDocument()
  })

  it('shows a separate warning when a project succeeds without Knowledge Base linking', async () => {
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
      return {
        ...project,
        setupWarning: 'Project was added, but its Knowledge Base folder could not be linked.'
      }
    }

    render(<App />)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Add project' }))[0])
    fireEvent.change(await screen.findByLabelText('Project name'), {
      target: { value: 'Agent Workspace' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }))

    expect(await screen.findByRole('button', { name: 'Agent Workspace' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Project was added, but its Knowledge Base folder could not be linked.'
    )
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
    expect(screen.getByText('Project Home')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'New Session' }))

    expect(await screen.findByRole('button', { name: /Session 2/ })).toBeInTheDocument()
    expect(
      await screen.findByText(
        'Ask the agent to work on this project. Streamed replies appear here.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Session 2' })).not.toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'breadcrumb' })).toHaveTextContent(
      'Space ZeroSession 2'
    )

    rendered.unmount()
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Space Zero' }))
    expect(await screen.findByRole('button', { name: /Session 1/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Session 2/ })).toBeInTheDocument()
  })

  it('shows persisted GitHub sources in Session breadcrumbs and reopens in-app detail', async () => {
    const repository = {
      id: '1000',
      nodeId: 'R_1000',
      installationId: '100',
      owner: 'bity-labs',
      name: 'spacezero',
      fullName: 'bity-labs/spacezero',
      isPrivate: true,
      defaultBranch: 'main',
      htmlUrl: 'https://github.com/bity-labs/spacezero',
      cloneUrl: 'https://github.com/bity-labs/spacezero.git'
    }
    window.spacezero.projects.list = async () => [
      {
        id: 'project-1',
        name: 'Space Zero',
        path: '/Users/tiby/ws/dev/spacezero',
        githubRepository: {
          repositoryId: '1000',
          nodeId: 'R_1000',
          owner: 'bity-labs',
          name: 'spacezero',
          fullName: 'bity-labs/spacezero',
          htmlUrl: repository.htmlUrl,
          linkedAt: new Date(0).toISOString()
        },
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      }
    ]
    window.spacezero.sessions.listProjectSessions = async () => [
      {
        id: 'session-1',
        kind: 'project',
        projectId: 'project-1',
        title: 'Issue #83: GitHub integration',
        status: 'idle',
        worktree: {
          path: '/SpaceZero/worktrees/project-1/session-1',
          branch: 'spacezero/issue-83-session-1',
          baseRevision: 'abc123'
        },
        source: {
          type: 'issue',
          repositoryId: '1000',
          repositoryNodeId: 'R_1000',
          repositoryOwner: 'bity-labs',
          repositoryName: 'spacezero',
          repositoryFullName: 'bity-labs/spacezero',
          number: 83,
          url: 'https://github.com/bity-labs/spacezero/issues/83',
          title: 'GitHub integration'
        },
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      },
      {
        id: 'session-pr-1',
        kind: 'project',
        projectId: 'project-1',
        title: 'Pull Request #79: Managed storage foundation',
        status: 'idle',
        worktree: {
          path: '/SpaceZero/worktrees/project-1/session-pr-1',
          branch: 'spacezero/pull-request-79-session-pr-1',
          baseRevision: 'def456'
        },
        source: {
          type: 'pull-request',
          repositoryId: '1000',
          repositoryNodeId: 'R_1000',
          repositoryOwner: 'bity-labs',
          repositoryName: 'spacezero',
          repositoryFullName: 'bity-labs/spacezero',
          number: 79,
          url: 'https://github.com/bity-labs/spacezero/pull/79',
          title: 'Managed storage foundation'
        },
        createdAt: new Date(1).toISOString(),
        updatedAt: new Date(1).toISOString()
      }
    ]
    window.spacezero.github.getConnection = async () => ({
      status: 'connected',
      identity: {
        id: '42',
        login: 'octocat',
        avatarUrl: 'https://avatars.example/42',
        profileUrl: 'https://github.com/octocat'
      },
      installations: [],
      repositories: [repository]
    })
    window.spacezero.github.getProjectRepository = async () => repository
    window.spacezero.github.getIssue = async () => ({
      number: 83,
      title: 'GitHub integration',
      body: 'Restored Issue detail',
      state: 'open',
      htmlUrl: 'https://github.com/bity-labs/spacezero/issues/83',
      author: { id: '42', login: 'octocat', avatarUrl: 'https://avatars.example/42' },
      labels: [],
      assignees: [],
      commentCount: 0,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString()
    })
    window.spacezero.github.listIssueComments = async ({ page }) => ({
      items: [],
      page,
      hasNextPage: false
    })
    window.spacezero.github.getPullRequest = async () => ({
      number: 79,
      title: 'Managed storage foundation',
      body: 'Restored Pull Request detail',
      state: 'open',
      isDraft: false,
      htmlUrl: 'https://github.com/bity-labs/spacezero/pull/79',
      author: { id: '42', login: 'octocat', avatarUrl: 'https://avatars.example/42' },
      baseBranch: 'main',
      headBranch: 'feat/storage',
      commitCount: 4,
      conversationCommentCount: 0,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString()
    })
    window.spacezero.github.listPullRequestComments = async ({ page }) => ({
      items: [],
      page,
      hasNextPage: false
    })

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Space Zero' }))
    fireEvent.click(await screen.findByRole('button', { name: /Issue #83: GitHub integration/ }))
    expect(await screen.findByRole('button', { name: 'Issue #83' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Issue #83' }))

    expect(await screen.findByText('Restored Issue detail')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start Session from Issue' })).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: /Pull Request #79: Managed storage foundation/ })
    )
    expect(await screen.findByRole('button', { name: 'Pull Request #79' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Pull Request #79' }))

    expect(await screen.findByText('Restored Pull Request detail')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Start Session from Pull Request' })
    ).not.toBeInTheDocument()
  })

  it('replaces the active project session when another project session is selected', async () => {
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
      await screen.findByText(
        'Ask the agent to work on this project. Streamed replies appear here.'
      )
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Space Zero → Session 1' })
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Working directory')).not.toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'breadcrumb' })).toHaveTextContent(
      'Space ZeroSession 1'
    )
    expect(screen.getByRole('button', { name: 'Files' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Browser' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Terminal' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Git' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: /Session 2/ }))

    expect(screen.getByRole('navigation', { name: 'breadcrumb' })).toHaveTextContent(
      'Space ZeroSession 2'
    )
    expect(screen.queryByRole('heading', { name: 'Session 2' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Session 1' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Session 1' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Session 2' })).not.toBeInTheDocument()
  })

  it('replaces the active session instead of opening side-by-side panels or tabs', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: /Session 2/ }))
    fireEvent.click(screen.getByRole('button', { name: /Session 3/ }))

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Session 1' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Session 2' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Session 3' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Session 3' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Session 1' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Session 2' })).not.toBeInTheDocument()
    expect(await screen.findByRole('textbox', { name: 'Agent prompt' })).toHaveAttribute(
      'placeholder',
      'Message Space Zero / Session 3…'
    )
    expect(screen.getByRole('navigation', { name: 'breadcrumb' })).toHaveTextContent(
      'Space ZeroSession 3'
    )
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
    expect(screen.getByRole('navigation', { name: 'breadcrumb' })).toHaveTextContent(
      'Space Zero Desktop'
    )
    expect(screen.queryByText('/Users/tiby/ws/dev/spacezero-desktop')).not.toBeInTheDocument()
  })

  it('supports keyboard resizing for the left column', async () => {
    render(<App />)

    await screen.findByRole('banner')
    const leftResize = screen.getByRole('separator', { name: 'Resize left panel' })

    expect(leftResize).toHaveAttribute('aria-valuenow', '280')

    fireEvent.keyDown(leftResize, { key: 'ArrowRight' })

    expect(leftResize).toHaveAttribute('aria-valuenow', '304')
    expect(screen.queryByRole('separator', { name: 'Resize Tool Pane' })).not.toBeInTheDocument()
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
    expect(screen.getByRole('heading', { name: 'Account' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#/settings?section=account')

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

  it('shows simplified Settings controls with no search or upgrade affordance', async () => {
    render(<App />)

    fireEvent.click(await screen.findByRole('link', { name: 'Open app settings' }))

    expect(await screen.findByRole('main', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.queryByRole('searchbox', { name: 'Search Settings' })).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Search settings')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Upgrade to Pro' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Close settings' })).toBeInTheDocument()
  })

  it('shows only implemented Settings categories and opens the account area from the sidebar', async () => {
    render(<App />)

    fireEvent.click(await screen.findByRole('link', { name: 'Open app settings' }))

    expect(await screen.findByRole('heading', { name: 'Account' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect GitHub' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'General' }))
    expect(await screen.findByRole('heading', { name: 'General' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'General' })).toHaveAttribute('data-active')
    expect(screen.getByRole('link', { name: 'Models' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Agents' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Skills' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'About' })).toBeInTheDocument()
    expect(screen.queryByText('Profile')).not.toBeInTheDocument()
    expect(screen.queryByText('Appearance')).not.toBeInTheDocument()
    expect(screen.queryByText('Cloud Agents')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Language' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Theme' })).toBeInTheDocument()
    expect(screen.getByText('/tmp/SpaceZero')).toBeInTheDocument()
    expect(
      screen.queryByText(
        'New projects and repositories will be created in /tmp/SpaceZero/projects.'
      )
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument()
    expect(screen.queryByText('Space Zero Account')).not.toBeInTheDocument()
    expect(screen.queryByText('Pull Requests')).not.toBeInTheDocument()
    expect(screen.queryByText('Notifications')).not.toBeInTheDocument()
    expect(window.location.hash).toBe('#/settings')
  })

  it('does not show restart affordances when no update is downloaded', async () => {
    render(<App />)

    expect(await screen.findByRole('main', { name: 'Main workspace' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Restart to update Space Zero' })
    ).not.toBeInTheDocument()
  })

  it('shows downloaded update state in the sidebar and Settings/About', async () => {
    window.spacezero.update.getStatus = async () => ({
      currentVersion: '0.1.0-beta.1',
      releaseChannel: 'beta',
      lastCheckedAt: '2026-01-02T03:04:05.000Z',
      state: 'update-downloaded',
      availableVersion: '0.1.0-beta.2',
      downloadedVersion: '0.1.0-beta.2',
      errorMessage: null,
      releaseNotesUrl: 'https://github.com/bity-labs/spacezero/releases'
    })

    render(<App />)

    expect(
      await screen.findByRole('button', { name: 'Restart to update Space Zero' })
    ).toHaveTextContent('Update ready')
    fireEvent.click(screen.getByRole('link', { name: 'Open app settings' }))
    fireEvent.click(await screen.findByRole('link', { name: 'About' }))

    expect(await screen.findByText('Update downloaded')).toBeInTheDocument()
    expect(screen.getByText('Restart to update to 0.1.0-beta.2')).toBeInTheDocument()
  })

  it('cancels and confirms restart/apply after active Project Session, Chat Context, and Terminal warnings', async () => {
    const applyDownloadedUpdate = vi.fn(async ({ confirmActiveWork } = {}) => ({
      status: confirmActiveWork ? ('applying' as const) : ('needs-confirmation' as const),
      activeWork: { projectSessions: 1, chatContexts: 1, terminalTabs: 1 },
      updateStatus: {
        currentVersion: '0.1.0-beta.1',
        releaseChannel: 'beta' as const,
        lastCheckedAt: '2026-01-02T03:04:05.000Z',
        state: 'update-downloaded' as const,
        availableVersion: '0.1.0-beta.2',
        downloadedVersion: '0.1.0-beta.2',
        errorMessage: null,
        releaseNotesUrl: 'https://github.com/bity-labs/spacezero/releases'
      }
    }))
    window.spacezero.update.getStatus = async () => ({
      currentVersion: '0.1.0-beta.1',
      releaseChannel: 'beta',
      lastCheckedAt: '2026-01-02T03:04:05.000Z',
      state: 'update-downloaded',
      availableVersion: '0.1.0-beta.2',
      downloadedVersion: '0.1.0-beta.2',
      errorMessage: null,
      releaseNotesUrl: 'https://github.com/bity-labs/spacezero/releases'
    })
    window.spacezero.update.applyDownloadedUpdate = applyDownloadedUpdate

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Restart to update Space Zero' }))

    expect(
      await screen.findByRole('heading', { name: 'Restart and apply update?' })
    ).toBeInTheDocument()
    expect(screen.getByText(/1 active Project Session/)).toBeInTheDocument()
    expect(screen.getByText(/1 active Chat Context/)).toBeInTheDocument()
    expect(screen.getByText(/1 active Terminal tab/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Restart and apply update?' })
      ).not.toBeInTheDocument()
    )

    fireEvent.click(screen.getByRole('button', { name: 'Restart to update Space Zero' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Restart and apply update' }))

    expect(applyDownloadedUpdate).toHaveBeenNthCalledWith(1, { confirmActiveWork: false })
    expect(applyDownloadedUpdate).toHaveBeenNthCalledWith(2, { confirmActiveWork: false })
    expect(applyDownloadedUpdate).toHaveBeenNthCalledWith(3, { confirmActiveWork: true })
  })

  it('shows About update status and manually checks for updates from Settings', async () => {
    const checkForUpdates = vi.fn(async () => ({
      currentVersion: '0.1.0-beta.1',
      releaseChannel: 'beta' as const,
      lastCheckedAt: '2026-01-02T03:04:05.000Z',
      state: 'no-update-available' as const,
      availableVersion: null,
      downloadedVersion: null,
      errorMessage: null,
      releaseNotesUrl: 'https://github.com/bity-labs/spacezero/releases'
    }))
    window.spacezero.update.getStatus = async () => ({
      currentVersion: '0.1.0-beta.1',
      releaseChannel: 'beta',
      lastCheckedAt: null,
      state: 'idle',
      availableVersion: null,
      downloadedVersion: null,
      errorMessage: null,
      releaseNotesUrl: 'https://github.com/bity-labs/spacezero/releases'
    })
    window.spacezero.update.checkForUpdates = checkForUpdates

    render(<App />)

    fireEvent.click(await screen.findByRole('link', { name: 'Open app settings' }))
    fireEvent.click(await screen.findByRole('link', { name: 'About' }))

    expect(await screen.findByRole('heading', { name: 'About' })).toBeInTheDocument()
    expect(screen.getByText('0.1.0-beta.1')).toBeInTheDocument()
    expect(screen.getByText('Beta channel')).toBeInTheDocument()
    expect(screen.getByText('Not checked yet')).toBeInTheDocument()
    expect(screen.getByText('Never checked')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'GitHub Release notes' })).toHaveAttribute(
      'href',
      'https://github.com/bity-labs/spacezero/releases'
    )

    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }))

    expect(await screen.findByText('No update available')).toBeInTheDocument()
    expect(checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it('reflects asynchronous update lifecycle changes while About remains mounted', async () => {
    let statusChangeListener: ((status: UpdateStatus) => void) | undefined
    window.spacezero.update.onStatusChange = (listener) => {
      statusChangeListener = listener
      return () => {
        statusChangeListener = undefined
      }
    }
    window.spacezero.update.getStatus = async () => ({
      currentVersion: '0.1.0-beta.1',
      releaseChannel: 'beta',
      lastCheckedAt: null,
      state: 'idle',
      availableVersion: null,
      downloadedVersion: null,
      errorMessage: null,
      releaseNotesUrl: 'https://github.com/bity-labs/spacezero/releases'
    })
    window.spacezero.update.checkForUpdates = async () => ({
      currentVersion: '0.1.0-beta.1',
      releaseChannel: 'beta',
      lastCheckedAt: '2026-01-02T03:04:05.000Z',
      state: 'update-available',
      availableVersion: '0.1.0-beta.2',
      downloadedVersion: null,
      errorMessage: null,
      releaseNotesUrl: 'https://github.com/bity-labs/spacezero/releases'
    })

    await act(async () => {
      await router.navigate({ to: '/settings', search: { section: 'about' } })
    })
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Check for updates' }))

    expect(await screen.findByText('Update available')).toBeInTheDocument()
    expect(screen.getByText('Available version')).toBeInTheDocument()

    act(() => {
      statusChangeListener?.({
        currentVersion: '0.1.0-beta.1',
        releaseChannel: 'beta',
        lastCheckedAt: '2026-01-02T03:04:05.000Z',
        state: 'update-downloaded',
        availableVersion: '0.1.0-beta.2',
        downloadedVersion: '0.1.0-beta.2',
        errorMessage: null,
        releaseNotesUrl: 'https://github.com/bity-labs/spacezero/releases'
      })
    })

    expect(await screen.findByText('Update downloaded')).toBeInTheDocument()
    expect(screen.getByText('Downloaded version')).toBeInTheDocument()

    act(() => {
      statusChangeListener?.({
        currentVersion: '0.1.0-beta.1',
        releaseChannel: 'beta',
        lastCheckedAt: '2026-01-02T03:04:05.000Z',
        state: 'error',
        availableVersion: '0.1.0-beta.2',
        downloadedVersion: null,
        errorMessage: 'Download failed',
        releaseNotesUrl: 'https://github.com/bity-labs/spacezero/releases'
      })
    })

    expect(await screen.findByText('Update check failed')).toBeInTheDocument()
    expect(screen.getByText('Download failed')).toBeInTheDocument()
  })

  it.each([
    ['checking', 'Checking for updates…'],
    ['update-available', 'Update available'],
    ['update-downloaded', 'Update downloaded'],
    ['error', 'Update check failed']
  ] as const)('renders the %s About update state', async (state, label) => {
    window.spacezero.update.getStatus = async () => ({
      currentVersion: '0.1.0-beta.1',
      releaseChannel: 'beta',
      lastCheckedAt: '2026-01-02T03:04:05.000Z',
      state,
      availableVersion:
        state === 'update-available' || state === 'update-downloaded' ? '0.1.0-beta.2' : null,
      downloadedVersion: state === 'update-downloaded' ? '0.1.0-beta.2' : null,
      errorMessage: state === 'error' ? 'GitHub releases unavailable' : null,
      releaseNotesUrl: 'https://github.com/bity-labs/spacezero/releases'
    })

    await act(async () => {
      await router.navigate({ to: '/settings', search: { section: 'about' } })
    })
    render(<App />)

    expect(await screen.findByText(label)).toBeInTheDocument()
    if (state === 'update-available')
      expect(screen.getByText('Available version')).toBeInTheDocument()
    if (state === 'update-downloaded')
      expect(screen.getByText('Downloaded version')).toBeInTheDocument()
    if (state === 'error')
      expect(screen.getByText('GitHub releases unavailable')).toBeInTheDocument()
  })

  it('confirms and cancels Clear Browser Data in Settings without clearing the profile', async () => {
    const clearData = vi.fn<() => Promise<BrowserClearDataResult>>(async () => ({
      status: 'cleared',
      cleared: ['cookies-and-site-storage', 'cache', 'temporary-grants'],
      failures: []
    }))
    window.spacezero.browser.clearData = clearData

    render(<App />)

    fireEvent.click(await screen.findByRole('link', { name: 'Open app settings' }))
    fireEvent.click(await screen.findByRole('link', { name: 'General' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Clear Browser Data' }))
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'This signs sites out across Space Zero Browser contexts'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(clearData).not.toHaveBeenCalled()
  })

  it('clears Browser data from Settings after confirmation and reports success', async () => {
    const clearData = vi.fn<() => Promise<BrowserClearDataResult>>(async () => ({
      status: 'cleared',
      cleared: ['cookies-and-site-storage', 'cache', 'temporary-grants'],
      failures: []
    }))
    window.spacezero.browser.clearData = clearData

    render(<App />)

    fireEvent.click(await screen.findByRole('link', { name: 'Open app settings' }))
    fireEvent.click(await screen.findByRole('link', { name: 'General' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Clear Browser Data' }))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Clear Browser Data' })
    )

    await waitFor(() => expect(clearData).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/Browser data cleared/)).toBeInTheDocument()
  })

  it('disables Clear Browser Data while clearing and reports actionable partial failures', async () => {
    let resolveClear: ((value: BrowserClearDataResult) => void) | undefined
    const clearData = vi.fn(
      () =>
        new Promise<BrowserClearDataResult>((resolve) => {
          resolveClear = resolve
        })
    )
    window.spacezero.browser.clearData = clearData

    render(<App />)

    fireEvent.click(await screen.findByRole('link', { name: 'Open app settings' }))
    fireEvent.click(await screen.findByRole('link', { name: 'General' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Clear Browser Data' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Clear Browser Data' }))

    expect(within(dialog).getByRole('button', { name: 'Clearing…' })).toBeDisabled()
    if (!resolveClear) throw new Error('clearData promise was not started')
    resolveClear({
      status: 'partial-failure',
      cleared: ['cache', 'temporary-grants'],
      failures: [{ category: 'cookies-and-site-storage', message: 'storage failed' }]
    })

    expect(
      await screen.findByText(/Some Browser data could not be cleared: cookies and site storage/)
    ).toBeInTheDocument()
  })

  it('changes the Space Zero Home from General Settings', async () => {
    window.spacezero.settings.chooseSpaceZeroHome = async () => ({
      spaceZeroHome: '/tmp/AlternateSpaceZero',
      projectsPath: '/tmp/AlternateSpaceZero/projects',
      worktreesPath: '/tmp/AlternateSpaceZero/worktrees'
    })

    render(<App />)

    fireEvent.click(await screen.findByRole('link', { name: 'Open app settings' }))
    fireEvent.click(await screen.findByRole('link', { name: 'General' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Change' }))

    expect(await screen.findByText('/tmp/AlternateSpaceZero')).toBeInTheDocument()
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

  it('lists and toggles global Agent Skills from Skills Settings', async () => {
    let globalSkills = [
      {
        name: 'code-review',
        description: 'Review code changes.',
        scope: 'user' as const,
        path: '/Users/tiby/.agents/skills/code-review/SKILL.md',
        enabled: true
      }
    ]
    const toggleRequests: Array<{ path: string; enabled: boolean }> = []
    window.spacezero.agent.getGlobalSkills = async () => globalSkills
    window.spacezero.agent.setGlobalSkillEnabled = async (request) => {
      toggleRequests.push(request)
      globalSkills = globalSkills.map((skill) =>
        skill.path === request.path ? { ...skill, enabled: request.enabled } : skill
      )
      return globalSkills
    }

    await act(async () => {
      await router.navigate({ to: '/settings', search: { section: 'skills' } })
    })
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Skills' })).toBeInTheDocument()
    const skillsSectionHeading = screen.getByRole('heading', { name: 'Global Agent Skills' })
    const skillsSectionDescription = screen.getByText(
      'Choose which global skills Space Zero makes available to new and reloaded agent sessions.'
    )
    expect(skillsSectionDescription.parentElement).toBe(skillsSectionHeading.parentElement)
    const skillName = screen.getByText('code-review')
    expect(skillName).toBeInTheDocument()
    expect(screen.queryByText('/skill:code-review')).not.toBeInTheDocument()
    const skillPath = screen.getByText(/Users\/tiby\/\.agents\/skills\/code-review\/SKILL\.md/)
    expect(skillPath).toHaveClass('mt-2')

    const skillsCard = skillName.closest('[data-slot="card"]')
    const applyNote = screen.getByText('Changes apply to new or reloaded agent sessions.')
    expect(skillsCard).not.toContainElement(applyNote)
    expect(applyNote).toHaveClass('text-orange-600', 'dark:text-orange-400')

    fireEvent.click(screen.getByRole('switch', { name: 'Disable code-review' }))

    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Enable code-review' })).toBeInTheDocument()
    )
    expect(toggleRequests).toEqual([
      { path: '/Users/tiby/.agents/skills/code-review/SKILL.md', enabled: false }
    ])
  })

  it('filters global Agent Skills by skill name from Skills Settings', async () => {
    let globalSkills: AgentGlobalSkill[] = [
      {
        name: 'code-review',
        description: 'Review code changes.',
        scope: 'user',
        path: '/skills/code-review/SKILL.md',
        enabled: true
      },
      {
        name: 'Debug Tools',
        description: 'Find bugs quickly.',
        scope: 'spacezero',
        path: '/skills/debug-tools/SKILL.md',
        enabled: false
      },
      {
        name: 'ship-it',
        description: 'Prepare a release.',
        scope: 'user',
        path: '/skills/ship-it/SKILL.md',
        enabled: true
      }
    ]
    const toggleRequests: Array<{ path: string; enabled: boolean }> = []
    window.spacezero.agent.getGlobalSkills = async () => globalSkills
    window.spacezero.agent.setGlobalSkillEnabled = async (request) => {
      toggleRequests.push(request)
      globalSkills = globalSkills.map((skill) =>
        skill.path === request.path ? { ...skill, enabled: request.enabled } : skill
      )
      return globalSkills
    }

    await act(async () => {
      await router.navigate({ to: '/settings', search: { section: 'skills' } })
    })
    render(<App />)

    const searchInput = await screen.findByRole('searchbox', {
      name: 'Search global skills by name'
    })
    expect(screen.getByText('code-review')).toBeInTheDocument()
    expect(screen.getByText('Debug Tools')).toBeInTheDocument()
    expect(screen.getByText('ship-it')).toBeInTheDocument()

    fireEvent.change(searchInput, { target: { value: 'debug' } })
    expect(screen.queryByText('code-review')).not.toBeInTheDocument()
    expect(screen.getByText('Debug Tools')).toBeInTheDocument()
    expect(screen.queryByText('ship-it')).not.toBeInTheDocument()

    fireEvent.change(searchInput, { target: { value: 'DEBUG' } })
    expect(screen.getByText('Debug Tools')).toBeInTheDocument()
    expect(screen.queryByText('code-review')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('switch', { name: 'Enable Debug Tools' }))
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Disable Debug Tools' })).toBeInTheDocument()
    )
    expect(toggleRequests).toEqual([{ path: '/skills/debug-tools/SKILL.md', enabled: true }])

    fireEvent.change(searchInput, { target: { value: '' } })
    expect(screen.getByText('code-review')).toBeInTheDocument()
    expect(screen.getByText('Debug Tools')).toBeInTheDocument()
    expect(screen.getByText('ship-it')).toBeInTheDocument()

    fireEvent.change(searchInput, { target: { value: 'missing' } })
    expect(screen.getByText('No global skills match that search.')).toBeInTheDocument()
    expect(screen.queryByText('code-review')).not.toBeInTheDocument()
    expect(screen.queryByText('Debug Tools')).not.toBeInTheDocument()
    expect(screen.queryByText('ship-it')).not.toBeInTheDocument()
  })

  it('blocks overlapping global Agent Skill toggles while an update is pending', async () => {
    const globalSkills: AgentGlobalSkill[] = [
      {
        name: 'code-review',
        description: 'Review code changes.',
        scope: 'user',
        path: '/skills/code-review/SKILL.md',
        enabled: true
      },
      {
        name: 'debug',
        description: 'Debug behavior.',
        scope: 'spacezero',
        path: '/skills/debug/SKILL.md',
        enabled: true
      }
    ]
    let resolveToggle: ((skills: AgentGlobalSkill[]) => void) | undefined
    window.spacezero.agent.getGlobalSkills = async () => globalSkills
    window.spacezero.agent.setGlobalSkillEnabled = vi.fn(
      () =>
        new Promise<AgentGlobalSkill[]>((resolve) => {
          resolveToggle = resolve
        })
    )

    await act(async () => {
      await router.navigate({ to: '/settings', search: { section: 'skills' } })
    })
    render(<App />)

    const reviewSwitch = await screen.findByRole('switch', { name: 'Disable code-review' })
    const debugSwitch = screen.getByRole('switch', { name: 'Disable debug' })
    fireEvent.click(reviewSwitch)

    await waitFor(() => {
      expect(reviewSwitch).toHaveAttribute('aria-disabled', 'true')
      expect(debugSwitch).toHaveAttribute('aria-disabled', 'true')
    })
    fireEvent.click(debugSwitch)
    expect(window.spacezero.agent.setGlobalSkillEnabled).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveToggle?.([{ ...globalSkills[0], enabled: false }, globalSkills[1]])
      await Promise.resolve()
    })

    expect(await screen.findByRole('switch', { name: 'Enable code-review' })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    )
    expect(screen.getByRole('switch', { name: 'Disable debug' })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    )
  })

  it('connects and disconnects a subscription through the Models Settings broker', async () => {
    let connected = false
    const loginProviders: string[] = []
    const logoutProviders: string[] = []
    window.spacezero.agent.getModelAuthSettings = async () => ({
      subscriptions: {
        connected: connected
          ? [
              {
                providerId: 'pi-oauth-provider',
                label: 'Pi OAuth Provider',
                configured: true,
                source: 'stored',
                displayLabel: 'Connected',
                removable: true
              }
            ]
          : [],
        availableProviders: [
          {
            providerId: 'pi-oauth-provider',
            label: 'Pi OAuth Provider',
            description: 'Provided by Pi metadata'
          }
        ]
      },
      apiKeys: { configured: [], availableProviders: [] }
    })
    window.spacezero.agent.loginOAuth = async ({ providerId }) => {
      loginProviders.push(providerId)
      connected = true
    }
    window.spacezero.agent.logoutOAuth = async ({ providerId }) => {
      logoutProviders.push(providerId)
      connected = false
    }
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    await act(async () => {
      await router.navigate({ to: '/settings', search: { section: 'models' } })
    })
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Add subscription' }))
    const picker = await screen.findByRole('dialog', { name: 'Add subscription' })
    expect(within(picker).getByText('Provided by Pi metadata')).toBeInTheDocument()
    fireEvent.click(within(picker).getByRole('button', { name: /Pi OAuth Provider/ }))

    expect(await screen.findByText('Subscription connected.')).toBeInTheDocument()
    expect(screen.getByText('Pi OAuth Provider')).toBeInTheDocument()
    expect(loginProviders).toEqual(['pi-oauth-provider'])

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))

    expect(await screen.findByText('No subscriptions connected.')).toBeInTheDocument()
    expect(logoutProviders).toEqual(['pi-oauth-provider'])
  })

  it('adds, tests, and removes an API key through the Models Settings broker', async () => {
    let configured = false
    const addedKeys: string[] = []
    const removedProviders: string[] = []
    const testedProviders: string[] = []
    window.spacezero.agent.getModelAuthSettings = async () => ({
      subscriptions: { connected: [], availableProviders: [] },
      apiKeys: {
        configured: configured
          ? [
              {
                providerId: 'anthropic',
                label: 'Anthropic',
                configured: true,
                source: 'stored',
                displayLabel: 'Stored API key',
                removable: true
              }
            ]
          : [],
        availableProviders: [{ providerId: 'anthropic', label: 'Anthropic' }]
      }
    })
    window.spacezero.agent.addApiKey = async ({ apiKey }) => {
      addedKeys.push(apiKey)
      configured = true
    }
    window.spacezero.agent.testAuth = async ({ providerId }) => {
      testedProviders.push(providerId)
      return { ok: true }
    }
    window.spacezero.agent.removeApiKey = async ({ providerId }) => {
      removedProviders.push(providerId)
      configured = false
    }
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    await act(async () => {
      await router.navigate({ to: '/settings', search: { section: 'models' } })
    })
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Add API key' }))
    const picker = await screen.findByRole('dialog', { name: 'Add API key' })
    fireEvent.click(within(picker).getByRole('button', { name: 'Anthropic' }))

    const keyDialog = await screen.findByRole('dialog', { name: 'Enter API key' })
    expect(within(keyDialog).getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.change(within(keyDialog).getByLabelText('API key'), {
      target: { value: 'sk-secret' }
    })
    fireEvent.click(within(keyDialog).getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Stored API key')).toBeInTheDocument()
    expect(addedKeys).toEqual(['sk-secret'])
    expect(screen.queryByDisplayValue('sk-secret')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    expect(await screen.findByText('Authentication works.')).toBeInTheDocument()
    expect(testedProviders).toEqual(['anthropic'])

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(await screen.findByText('No API keys configured.')).toBeInTheDocument()
    expect(removedProviders).toEqual(['anthropic'])
  })

  it('shows disabled defaults and available-model states until authentication unlocks models', async () => {
    await act(async () => {
      await router.navigate({ to: '/settings', search: { section: 'models' } })
    })
    render(<App />)

    expect(
      await screen.findByText('Configure credentials to choose a default model.')
    ).toBeInTheDocument()
    expect(
      screen.getByText('Configure credentials to browse available models.')
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
    fireEvent.change(input, { target: { value: 'tool pane' } })
    expect(screen.getByText('Toggle Tool Pane')).toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(screen.queryByRole('complementary', { name: 'Tool Pane' })).not.toBeInTheDocument()
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
    fireEvent.click(await screen.findByRole('link', { name: 'General' }))
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
    expect(screen.getByText('Chat')).toBeInTheDocument()
    expect(screen.getByText('Projets')).toBeInTheDocument()
  })

  it('updates the theme from Settings without requiring a restart', async () => {
    render(<App />)

    fireEvent.click(await screen.findByRole('link', { name: 'Open app settings' }))
    fireEvent.click(await screen.findByRole('link', { name: 'General' }))
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
