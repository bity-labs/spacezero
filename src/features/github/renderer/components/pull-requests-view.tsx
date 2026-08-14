import { useQueries, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import type { Project } from '../../../projects/shared'
import type { ProjectSession } from '../../../sessions/shared'
import type { GitHubIssueComment } from '../../shared'
import { githubReadErrorMessage } from '../github-error-messages'
import { useProjectPullRequest, useProjectPullRequests } from '../hooks/use-project-pull-requests'
import { PullRequestReviewSections } from './pull-request-review-sections'
import {
  PullRequestDetailScreen,
  PullRequestListScreen,
  type PullRequestDetailState,
  type PullRequestListState
} from './pull-requests-screen'

export function PullRequestsViewLoading(): React.JSX.Element {
  return (
    <PullRequestListScreen
      state={{ status: 'loading' }}
      fetching
      onRefresh={() => undefined}
      onRetry={() => undefined}
      onPageChange={() => undefined}
      onOpenPullRequest={() => undefined}
    />
  )
}

export function PullRequestsView({
  project,
  initialPullRequestNumber = null
}: {
  project: Project
  initialPullRequestNumber?: number | null
  onSessionCreated?: (session: ProjectSession) => void
}): React.JSX.Element {
  const [page, setPage] = useState(1)
  const [selectedPullRequest, setSelectedPullRequest] = useState<number | null>(initialPullRequestNumber)

  if (selectedPullRequest !== null) {
    return (
      <PullRequestDetail
        projectId={project.id}
        number={selectedPullRequest}
        onBack={() => setSelectedPullRequest(null)}
      />
    )
  }

  return <PullRequestList projectId={project.id} page={page} onPageChange={setPage} onOpenPullRequest={setSelectedPullRequest} />
}

function PullRequestList({
  projectId,
  page,
  onPageChange,
  onOpenPullRequest
}: {
  projectId: string
  page: number
  onPageChange: (page: number) => void
  onOpenPullRequest: (number: number) => void
}): React.JSX.Element {
  const query = useProjectPullRequests(projectId, page)
  const state: PullRequestListState = query.isPending
    ? { status: 'loading' }
    : query.isError
      ? { status: 'error', message: githubReadErrorMessage(query.error, 'Pull Requests') }
      : {
          status: 'ready',
          ...query.data,
          items: query.data.items.filter((pullRequest) => pullRequest.state !== 'merged')
        }

  return (
    <PullRequestListScreen
      state={state}
      fetching={query.isFetching}
      onRefresh={() => void query.refetch()}
      onRetry={() => void query.refetch()}
      onPageChange={onPageChange}
      onOpenPullRequest={onOpenPullRequest}
    />
  )
}

function PullRequestDetail({ projectId, number, onBack }: { projectId: string; number: number; onBack: () => void }): React.JSX.Element {
  const [commentsPage, setCommentsPage] = useState(1)
  const queryClient = useQueryClient()
  const pullRequestQuery = useProjectPullRequest(projectId, number)
  const commentQueries = useQueries({
    queries: Array.from({ length: commentsPage }, (_, index) => {
      const page = index + 1
      return {
        queryKey: ['github', 'pull-request-comments', projectId, number, page, 20],
        queryFn: () => window.spacezero.github.listPullRequestComments({ projectId, number, page, perPage: 20 }),
        refetchOnMount: 'always' as const,
        refetchOnWindowFocus: 'always' as const
      }
    })
  })
  const loadedComments = uniqueComments(commentQueries.flatMap((query) => (query.isError || !query.data ? [] : query.data.items)))
  const lastCommentsPage = commentQueries.at(-1)?.data
  const commentsFetching = commentQueries.some((query) => query.isFetching)
  const commentsError = commentQueries.find((query) => query.isError)?.error
  const state: PullRequestDetailState = pullRequestQuery.isPending
    ? { status: 'loading' }
    : pullRequestQuery.isError
      ? { status: 'error', message: githubReadErrorMessage(pullRequestQuery.error, 'Pull Request') }
      : { status: 'ready', pullRequest: pullRequestQuery.data }
  const comments = commentQueries.some((query) => query.isPending) && loadedComments.length === 0
    ? { status: 'loading' as const }
    : commentsError
      ? { status: 'error' as const, message: githubReadErrorMessage(commentsError, 'Pull Request conversation'), items: loadedComments }
      : { status: 'ready' as const, items: loadedComments, hasNextPage: lastCommentsPage?.hasNextPage ?? false }

  return (
    <PullRequestDetailScreen
      number={number}
      state={state}
      comments={comments}
      fetching={pullRequestQuery.isFetching || commentsFetching}
      onBack={onBack}
      onRefresh={() => {
        void Promise.all([
          pullRequestQuery.refetch(),
          ...commentQueries.map((query) => query.refetch()),
          queryClient.refetchQueries({ queryKey: ['github', 'pull-request-commits', projectId, number] }),
          queryClient.refetchQueries({ queryKey: ['github', 'pull-request-files', projectId, number] }),
          queryClient.refetchQueries({ queryKey: ['github', 'pull-request-commit-statuses', projectId, number] })
        ])
      }}
      onRetry={() => void pullRequestQuery.refetch()}
      onRetryComments={() => void Promise.all(commentQueries.map((query) => query.refetch()))}
      onLoadMoreComments={() => setCommentsPage((current) => current + 1)}
      reviewSections={state.status === 'ready' ? <PullRequestReviewSections projectId={projectId} number={number} /> : undefined}
    />
  )
}

function uniqueComments(comments: GitHubIssueComment[]): GitHubIssueComment[] {
  const seen = new Set<string>()
  return comments.filter((comment) => {
    if (seen.has(comment.id)) return false
    seen.add(comment.id)
    return true
  })
}
