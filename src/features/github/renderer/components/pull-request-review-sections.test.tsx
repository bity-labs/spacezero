import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import { createGitHubQueryClient } from '../github-query-client'
import { PullRequestReviewSections } from './pull-request-review-sections'

function renderSections(): ReturnType<typeof render> {
  return render(
    <QueryClientProvider client={createGitHubQueryClient()}>
      <PullRequestReviewSections projectId="project-1" number={79} />
    </QueryClientProvider>
  )
}

describe('PullRequestReviewSections', () => {
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
              patch: { status: 'available', text: '+page two', truncated: false }
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
    expect(screen.queryByText('deploy')).not.toBeInTheDocument()
    expect(screen.queryByText('Looks good')).not.toBeInTheDocument()
    expect(screen.queryByText(/rate limit was reached/i)).not.toBeInTheDocument()
    expect(screen.queryByText('GitHub Actions')).not.toBeInTheDocument()

    const files = screen.getByRole('region', { name: 'Changed files' })
    const next = within(files).getByRole('button', { name: 'Next' })
    await waitFor(() => expect(next).toBeEnabled())
    fireEvent.click(next)
    expect(await screen.findByText('src/page-two.ts')).toBeInTheDocument()
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
