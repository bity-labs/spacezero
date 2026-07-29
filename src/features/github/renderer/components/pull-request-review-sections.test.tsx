import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createGitHubQueryClient } from '../github-query-client'
import { PullRequestReviewSections } from './pull-request-review-sections'

type MockDiffViewerCall = {
  ariaLabel?: string
  items: Array<{
    id: string
    path: string
    oldPath?: string
    patch: string
    collapsed?: boolean
    version?: number
    changeMetadata?: {
      status: string
      additions?: number
      deletions?: number
    }
  }>
}

const { diffViewerCalls } = vi.hoisted(() => ({
  diffViewerCalls: [] as MockDiffViewerCall[]
}))

vi.mock('@renderer/components/diff-viewer', async () => {
  const React = await import('react')
  const DiffViewer = vi.fn((props: MockDiffViewerCall) => {
    diffViewerCalls.push(props)
    return React.createElement(
      'div',
      { 'aria-label': props.ariaLabel, 'data-testid': 'shared-diff-viewer' },
      props.items.map((item) =>
        React.createElement('div', { key: item.id }, [
          React.createElement('span', { key: 'path' }, item.path),
          React.createElement('pre', { key: 'patch' }, item.patch),
          item.oldPath
            ? React.createElement('span', { key: 'rename' }, `renamed from ${item.oldPath}`)
            : null,
          item.changeMetadata
            ? React.createElement('span', { key: 'metadata' }, [
                React.createElement('span', { key: 'status' }, item.changeMetadata.status),
                React.createElement('span', { key: 'additions' }, `+${item.changeMetadata.additions}`),
                React.createElement('span', { key: 'deletions' }, `−${item.changeMetadata.deletions}`)
              ])
            : null
        ])
      )
    )
  })
  return { DiffViewer }
})

function renderSections(): ReturnType<typeof render> {
  return render(
    <QueryClientProvider client={createGitHubQueryClient()}>
      <PullRequestReviewSections projectId="project-1" number={79} />
    </QueryClientProvider>
  )
}

describe('PullRequestReviewSections', () => {
  beforeEach(() => {
    diffViewerCalls.length = 0
  })

  it('renders available Pull Request file patches through the shared Diff Viewer', async () => {
    window.spacezero.github.listPullRequestCommits = async ({ page }) => ({
      items: [],
      page,
      hasNextPage: false
    })
    window.spacezero.github.listPullRequestFiles = async ({ page }) => ({
      items: [
        {
          sha: 'renamed-file-sha',
          filename: 'src/new-name.ts',
          previousFilename: 'src/old-name.ts',
          status: 'renamed',
          additions: 2,
          deletions: 1,
          changes: 3,
          patch: { status: 'available', text: '@@ -1 +1,2 @@\n-old\n+new\n+line', truncated: false }
        }
      ],
      page,
      hasNextPage: false
    })

    renderSections()

    expect(await screen.findByText('src/new-name.ts')).toBeInTheDocument()
    expect(screen.getByText('renamed from src/old-name.ts')).toBeInTheDocument()
    expect(screen.getByText('renamed')).toBeInTheDocument()
    expect(screen.getByText('+2')).toBeInTheDocument()
    expect(screen.getByText('−1')).toBeInTheDocument()
    expect(await screen.findByTestId('shared-diff-viewer')).toBeInTheDocument()
    expect(diffViewerCalls).toHaveLength(1)
    expect(diffViewerCalls[0]).toMatchObject({
      ariaLabel: 'Diff for src/new-name.ts',
      items: [
        {
          id: 'renamed-file-sha:src/new-name.ts',
          path: 'src/new-name.ts',
          oldPath: 'src/old-name.ts',
          patch: '@@ -1 +1,2 @@\n-old\n+new\n+line',
          collapsed: false
        }
      ]
    })
    expect(diffViewerCalls[0]?.items[0]?.version).toEqual(expect.any(Number))
  })

  it('loads every Pull Request commit page into one sequential commit list', async () => {
    const requestedCommitPages: Array<{ page: number; perPage?: number }> = []
    window.spacezero.github.listPullRequestCommits = async ({ page, perPage }) => {
      requestedCommitPages.push({ page, perPage })
      return {
        items: Array.from({ length: page === 1 ? 100 : 1 }, (_, index) => ({
          sha:
            page === 1
              ? `${String(index).padStart(40, '0')}`
              : 'ffffffffffffffffffffffffffffffffffffffff',
          message: page === 1 ? `First page commit ${index + 1}` : 'Sentinel second page commit',
          htmlUrl: 'https://github.com/example/repository/commit/example',
          author: { id: '42', login: 'octocat', avatarUrl: 'https://avatars.example/42' },
          authoredAt: '2026-07-18T01:30:00.000Z'
        })),
        page,
        hasNextPage: page === 1
      }
    }
    window.spacezero.github.listPullRequestFiles = async ({ page }) => ({
      items: [],
      page,
      hasNextPage: false
    })

    renderSections()

    const firstCommit = await screen.findByText('First page commit 1')
    const lastFirstPageCommit = await screen.findByText('First page commit 100')
    const sentinelCommit = await screen.findByText('Sentinel second page commit')
    expect(requestedCommitPages).toEqual([
      { page: 1, perPage: 100 },
      { page: 2, perPage: 100 }
    ])
    expect(
      firstCommit.compareDocumentPosition(lastFirstPageCommit) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(
      lastFirstPageCommit.compareDocumentPosition(sentinelCommit) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('preserves successful sections across patch states, pagination, and a partial endpoint failure', async () => {
    const filePages: number[] = []
    let checkReads = 0
    window.spacezero.github.listPullRequestCommits = async ({ page }) => ({
      items: [
        {
          sha: '0123456789abcdef0123456789abcdef01234567',
          message: 'feat: add managed worktrees',
          htmlUrl: 'https://github.com/example/repository/commit/0123456',
          author: { id: '42', login: 'octocat', avatarUrl: 'https://avatars.example/42' },
          authoredAt: '2026-07-18T01:30:00.000Z'
        }
      ],
      page,
      hasNextPage: false
    })
    window.spacezero.github.listPullRequestFiles = async ({ page }) => {
      filePages.push(page)
      if (page === 2) {
        return {
          items: [
            {
              sha: 'page-2',
              filename: 'src/page-two.ts',
              previousFilename: null,
              status: 'added',
              additions: 1,
              deletions: 0,
              changes: 1,
              patch: { status: 'available', text: '@@ -0,0 +1 @@\n+page two', truncated: false }
            }
          ],
          page,
          hasNextPage: false
        }
      }
      return {
        items: [
          {
            sha: 'text',
            filename: 'src/index.ts',
            previousFilename: null,
            status: 'modified',
            additions: 5,
            deletions: 5,
            changes: 10,
            patch: { status: 'available', text: '@@ -1 +1 @@\n-old\n+new', truncated: true }
          },
          {
            sha: 'binary',
            filename: 'assets/logo.png',
            previousFilename: null,
            status: 'modified',
            additions: 0,
            deletions: 0,
            changes: 0,
            patch: { status: 'binary' }
          },
          {
            sha: 'omitted',
            filename: 'fixtures/large.txt',
            previousFilename: null,
            status: 'modified',
            additions: 500,
            deletions: 500,
            changes: 1000,
            patch: { status: 'omitted' }
          },
          {
            sha: 'unavailable',
            filename: 'removed.txt',
            previousFilename: null,
            status: 'removed',
            additions: 0,
            deletions: 1,
            changes: 1,
            patch: { status: 'unavailable' }
          }
        ],
        page,
        hasNextPage: true
      }
    }
    window.spacezero.github.listPullRequestCheckRuns = async ({ page }) => {
      checkReads += 1
      if (checkReads === 1) throw new Error('github.rateLimited')
      return {
        items: [
          {
            id: 'check-1',
            name: 'test',
            status: 'completed',
            conclusion: 'success',
            detailsUrl: null,
            appName: 'GitHub Actions',
            startedAt: null,
            completedAt: null
          }
        ],
        page,
        hasNextPage: false
      }
    }
    window.spacezero.github.listPullRequestCommitStatuses = async ({ page }) => ({
      items: [
        {
          id: 'status-1',
          context: 'deploy',
          state: 'pending',
          description: 'Deployment queued',
          targetUrl: null,
          updatedAt: '2026-07-18T02:00:00.000Z'
        }
      ],
      page,
      hasNextPage: false
    })
    window.spacezero.github.listPullRequestReviews = async ({ page }) => ({
      items: [
        {
          id: 'review-1',
          state: 'approved',
          body: 'Looks good',
          htmlUrl: 'https://github.com/example/repository/pull/79#review-1',
          author: { id: '84', login: 'reviewer', avatarUrl: 'https://avatars.example/84' },
          submittedAt: '2026-07-18T03:00:00.000Z'
        }
      ],
      page,
      hasNextPage: false
    })

    renderSections()

    expect(await screen.findByText('feat: add managed worktrees')).toBeInTheDocument()
    expect(screen.getByText(/0123456789ab · octocat/)).toBeInTheDocument()
    expect(await screen.findByText('src/index.ts')).toBeInTheDocument()
    expect(screen.getByText(/truncated patch/i)).toBeInTheDocument()
    expect(screen.getByText(/Binary file/)).toBeInTheDocument()
    expect(screen.getByText(/GitHub omitted this patch/)).toBeInTheDocument()
    expect(screen.getByText(/patch is unavailable/)).toBeInTheDocument()
    expect(diffViewerCalls).toHaveLength(0)
    expect(screen.queryByText('deploy')).not.toBeInTheDocument()
    expect(screen.queryByText('Looks good')).not.toBeInTheDocument()
    expect(screen.queryByText(/rate limit was reached/i)).not.toBeInTheDocument()
    expect(screen.queryByText('GitHub Actions')).not.toBeInTheDocument()

    const files = screen.getByRole('region', { name: 'Changed files' })
    const next = within(files).getByRole('button', { name: 'Next' })
    await waitFor(() => expect(next).toBeEnabled())
    fireEvent.click(next)
    expect(await screen.findByText('src/page-two.ts')).toBeInTheDocument()
    expect(diffViewerCalls).toHaveLength(1)
    expect(filePages).toContain(2)
  })

  it('represents empty commits and files explicitly while checks, statuses, and reviews stay hidden', async () => {
    window.spacezero.github.listPullRequestCommits = async ({ page }) => ({
      items: [],
      page,
      hasNextPage: false
    })
    window.spacezero.github.listPullRequestFiles = async ({ page }) => ({
      items: [],
      page,
      hasNextPage: false
    })
    window.spacezero.github.listPullRequestCheckRuns = async ({ page }) => ({
      items: [],
      page,
      hasNextPage: false
    })
    window.spacezero.github.listPullRequestCommitStatuses = async ({ page }) => ({
      items: [],
      page,
      hasNextPage: false
    })
    window.spacezero.github.listPullRequestReviews = async ({ page }) => ({
      items: [],
      page,
      hasNextPage: false
    })

    renderSections()

    expect(await screen.findByText('No commits were returned.')).toBeInTheDocument()
    expect(await screen.findByText('No changed files were returned.')).toBeInTheDocument()
    expect(screen.queryByText('No check runs were reported.')).not.toBeInTheDocument()
    expect(screen.queryByText('No commit statuses were reported.')).not.toBeInTheDocument()
    expect(screen.queryByText('No submitted reviews yet.')).not.toBeInTheDocument()
  })
})
