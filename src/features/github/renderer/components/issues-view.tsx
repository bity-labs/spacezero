import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { Button } from '@renderer/components/ui/button'
import type { Project } from '../../../projects/shared'
import type { ProjectSession } from '../../../sessions/shared'
import type { GitHubIssue, GitHubIssueComment } from '../../shared'
import { githubMutationErrorMessage, githubReadErrorMessage } from '../github-error-messages'
import { useProjectIssue, useProjectIssues } from '../hooks/use-project-issues'
import {
  IssueDetailScreen,
  IssueListScreen,
  type IssueCommentsState,
  type IssueDetailState,
  type IssueListState
} from './issues-screen'

export function IssuesViewLoading(): React.JSX.Element {
  return (
    <IssueListScreen
      state={{ status: 'loading' }}
      fetching
      onRefresh={() => undefined}
      onRetry={() => undefined}
      onPageChange={() => undefined}
      onOpenIssue={() => undefined}
    />
  )
}

export function IssuesView({
  project,
  initialIssueNumber = null,
  onSessionCreated
}: {
  project: Project
  initialIssueNumber?: number | null
  onSessionCreated?: (session: ProjectSession) => void
}): React.JSX.Element {
  const [page, setPage] = useState(1)
  const [selectedIssue, setSelectedIssue] = useState<number | null>(initialIssueNumber)

  if (selectedIssue !== null) {
    return (
      <IssueDetail
        projectId={project.id}
        number={selectedIssue}
        onBack={() => setSelectedIssue(null)}
        onSessionCreated={onSessionCreated}
      />
    )
  }

  return (
    <IssueList
      projectId={project.id}
      page={page}
      onPageChange={setPage}
      onOpenIssue={setSelectedIssue}
    />
  )
}

function IssueList({
  projectId,
  page,
  onPageChange,
  onOpenIssue
}: {
  projectId: string
  page: number
  onPageChange: (page: number) => void
  onOpenIssue: (number: number) => void
}): React.JSX.Element {
  const query = useProjectIssues(projectId, page)
  const state: IssueListState = query.isPending
    ? { status: 'loading' }
    : query.isError
      ? { status: 'error', message: githubReadErrorMessage(query.error, 'Issues') }
      : { status: 'ready', ...query.data }

  return (
    <IssueListScreen
      state={state}
      fetching={query.isFetching}
      onRefresh={() => void query.refetch()}
      onRetry={() => void query.refetch()}
      onPageChange={onPageChange}
      onOpenIssue={onOpenIssue}
    />
  )
}

function IssueDetail({
  projectId,
  number,
  onBack,
  onSessionCreated
}: {
  projectId: string
  number: number
  onBack: () => void
  onSessionCreated?: (session: ProjectSession) => void
}): React.JSX.Element {
  const [commentsPage, setCommentsPage] = useState(1)
  const [commentBody, setCommentBody] = useState('')
  const [commentValidationError, setCommentValidationError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isStartingSession, setIsStartingSession] = useState(false)
  const [startSessionError, setStartSessionError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const issueQuery = useProjectIssue(projectId, number)
  const commentQueries = useQueries({
    queries: Array.from({ length: commentsPage }, (_, index) => {
      const page = index + 1
      return {
        queryKey: ['github', 'issue-comments', projectId, number, page, 20],
        queryFn: () => window.spacezero.github.listIssueComments({ projectId, number, page, perPage: 20 }),
        refetchOnMount: 'always' as const,
        refetchOnWindowFocus: 'always' as const
      }
    })
  })
  const loadedComments = uniqueComments(
    commentQueries.flatMap((query) => (query.isError || !query.data ? [] : query.data.items))
  )
  const lastCommentsPage = commentQueries.at(-1)?.data
  const commentsFetching = commentQueries.some((query) => query.isFetching)
  const commentsError = commentQueries.find((query) => query.isError)?.error
  const commentMutation = useMutation({
    mutationFn: (body: string) => window.spacezero.github.createIssueComment({ projectId, number, body }),
    onSuccess: async () => {
      setCommentBody('')
      setSuccessMessage('Comment added.')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['github', 'issue-comments', projectId, number] }),
        queryClient.invalidateQueries({ queryKey: ['github', 'issue', projectId, number] }),
        queryClient.invalidateQueries({ queryKey: ['github', 'issues', projectId] })
      ])
    }
  })
  const stateMutation = useMutation({
    mutationFn: (state: GitHubIssue['state']) => window.spacezero.github.updateIssueState({ projectId, number, state }),
    onSuccess: async (issue) => {
      setSuccessMessage(issue.state === 'closed' ? 'Issue closed.' : 'Issue reopened.')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['github', 'issue', projectId, number] }),
        queryClient.invalidateQueries({ queryKey: ['github', 'issues', projectId] })
      ])
    }
  })
  const issue = issueQuery.isError ? undefined : issueQuery.data
  const state: IssueDetailState = issueQuery.isPending
    ? { status: 'loading' }
    : issueQuery.isError
      ? { status: 'error', message: githubReadErrorMessage(issueQuery.error, 'Issue') }
      : { status: 'ready', issue: issueQuery.data }
  const comments: IssueCommentsState = commentQueries.some((query) => query.isPending) && loadedComments.length === 0
    ? { status: 'loading' }
    : commentsError
      ? { status: 'error', message: githubReadErrorMessage(commentsError, 'comments'), items: loadedComments }
      : { status: 'ready', items: loadedComments, hasNextPage: lastCommentsPage?.hasNextPage ?? false }

  const submitComment = (): void => {
    const body = commentBody.trim()
    setSuccessMessage(null)
    commentMutation.reset()
    if (!body) {
      setCommentValidationError('Enter a comment before submitting.')
      return
    }
    setCommentValidationError(null)
    commentMutation.mutate(body)
  }

  return (
    <IssueDetailScreen
      number={number}
      state={state}
      comments={comments}
      fetching={issueQuery.isFetching || commentsFetching}
      isStartingSession={isStartingSession}
      startSessionError={startSessionError}
      onBack={onBack}
      onRefresh={() => {
        void issueQuery.refetch()
        void Promise.all(commentQueries.map((query) => query.refetch()))
      }}
      onRetry={() => void issueQuery.refetch()}
      onRetryComments={() => void Promise.all(commentQueries.map((query) => query.refetch()))}
      onLoadMoreComments={() => setCommentsPage((current) => current + 1)}
      onStartSession={issue ? () => {
        setIsStartingSession(true)
        setStartSessionError(null)
        void window.spacezero.github.startIssueSession({ projectId, number })
          .then((session) => onSessionCreated?.(session))
          .catch(() => setStartSessionError('Could not create an isolated Session for this Issue. The Project was not changed.'))
          .finally(() => setIsStartingSession(false))
      } : undefined}
      secondaryActions={issue ? (
        <>
          <Button
            variant="outline"
            disabled={stateMutation.isPending}
            onClick={() => {
              setSuccessMessage(null)
              stateMutation.reset()
              stateMutation.mutate(issue.state === 'open' ? 'closed' : 'open')
            }}
          >
            {stateMutation.isPending ? 'Updating Issue…' : issue.state === 'open' ? 'Close Issue' : 'Reopen Issue'}
          </Button>
          {successMessage ? <p className="text-sm text-muted-foreground" role="status">{successMessage}</p> : null}
          {stateMutation.isError ? <p className="text-sm text-destructive" role="alert">{githubMutationErrorMessage(stateMutation.error)}</p> : null}
        </>
      ) : undefined}
      commentComposer={issue ? (
        <form className="space-y-2 rounded-lg border p-4" onSubmit={(event) => { event.preventDefault(); submitComment() }}>
          <label className="text-sm font-medium" htmlFor={`issue-${number}-comment`}>Add a comment</label>
          <textarea
            id={`issue-${number}-comment`}
            className="min-h-24 w-full resize-y rounded-md border bg-background p-3 text-sm"
            value={commentBody}
            maxLength={65_536}
            disabled={commentMutation.isPending}
            onChange={(event) => {
              setCommentBody(event.target.value)
              setCommentValidationError(null)
              setSuccessMessage(null)
            }}
          />
          {commentValidationError ? <p className="text-sm text-destructive" role="alert">{commentValidationError}</p> : null}
          {commentMutation.isError ? <p className="text-sm text-destructive" role="alert">{githubMutationErrorMessage(commentMutation.error)}</p> : null}
          <Button type="submit" disabled={commentMutation.isPending}>{commentMutation.isPending ? 'Adding comment…' : 'Add comment'}</Button>
        </form>
      ) : undefined}
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
