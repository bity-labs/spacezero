import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  issueCommentsFixture,
  issueFixture,
  pullRequestChecksFixture,
  pullRequestFixture,
  pullRequestReviewsFixture,
  repositoryOptionsFixture
} from './github-screens.fixtures'
import { IssueDetailScreen, IssueListScreen } from './issues-screen'
import { PullRequestDetailScreen, PullRequestListScreen } from './pull-requests-screen'
import { RepositorySetupView } from './repository-setup-view'

describe('pure GitHub screens', () => {
  it('renders repository search results and emits clone intent without the preload API', () => {
    const onStart = vi.fn()
    render(
      <RepositorySetupView
        options={repositoryOptionsFixture}
        searchQuery=""
        selectedRepositoryId="repository-1"
        selectedExistingProjectId={null}
        progress={null}
        error={null}
        isStarting={false}
        agentResourcesTrusted={false}
        onSearchQueryChange={() => undefined}
        onSelectRepository={() => undefined}
        onSelectExistingProject={() => undefined}
        onAgentResourcesTrustedChange={() => undefined}
        onStart={onStart}
        onCancel={() => undefined}
        onConfigureAccess={() => undefined}
      />
    )

    expect(screen.getByText('bity-labs/spacezero')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clone repository' }))
    expect(onStart).toHaveBeenCalledOnce()
  })

  it('renders Issue list, detail comments, and the Session affordance from props', () => {
    const onStartSession = vi.fn()
    const { rerender } = render(
      <IssueListScreen
        state={{ status: 'ready', items: [issueFixture], page: 1, hasNextPage: false }}
        fetching={false}
        onRefresh={() => undefined}
        onRetry={() => undefined}
        onPageChange={() => undefined}
        onOpenIssue={() => undefined}
      />
    )
    expect(screen.getByText(issueFixture.title)).toBeInTheDocument()

    rerender(
      <IssueDetailScreen
        number={issueFixture.number}
        state={{ status: 'ready', issue: issueFixture }}
        comments={{ status: 'ready', items: issueCommentsFixture, hasNextPage: false }}
        fetching={false}
        isStartingSession={false}
        startSessionError={null}
        onBack={() => undefined}
        onRefresh={() => undefined}
        onRetry={() => undefined}
        onRetryComments={() => undefined}
        onLoadMoreComments={() => undefined}
        onStartSession={onStartSession}
      />
    )
    expect(screen.getByText(issueCommentsFixture[0].body)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start Session from Issue' }))
    expect(onStartSession).toHaveBeenCalledOnce()
  })

  it('renders Pull Request detail checks and reviews from props', () => {
    render(
      <PullRequestDetailScreen
        number={pullRequestFixture.number}
        state={{ status: 'ready', pullRequest: pullRequestFixture }}
        comments={{ status: 'ready', items: [], hasNextPage: false }}
        checks={{ status: 'ready', items: pullRequestChecksFixture }}
        reviews={{ status: 'ready', items: pullRequestReviewsFixture }}
        fetching={false}
        onBack={() => undefined}
        onRefresh={() => undefined}
        onRetry={() => undefined}
        onRetryComments={() => undefined}
        onLoadMoreComments={() => undefined}
      />
    )

    expect(screen.getByText(pullRequestFixture.title)).toBeInTheDocument()
    expect(screen.getByText('test')).toBeInTheDocument()
    expect(screen.getByText('Looks good to ship.')).toBeInTheDocument()
  })

  it('renders the Pull Request empty state through the pure list screen', () => {
    render(
      <PullRequestListScreen
        state={{ status: 'ready', items: [], page: 1, hasNextPage: false }}
        fetching={false}
        onRefresh={() => undefined}
        onRetry={() => undefined}
        onPageChange={() => undefined}
        onOpenPullRequest={() => undefined}
      />
    )
    expect(screen.getByText('No Pull Requests were found in this repository.')).toBeInTheDocument()
  })
})
