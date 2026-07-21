import { useState } from 'react'

import { Badge } from '../../../../renderer/src/components/ui/badge'
import { Button } from '../../../../renderer/src/components/ui/button'
import type {
  GitHubPullRequestCommit,
  GitHubPullRequestFile,
  GitHubPullRequestPatch
} from '../../shared'
import { githubReadErrorMessage } from '../github-error-messages'
import {
  useProjectPullRequestCheckRuns,
  useProjectPullRequestCommitStatuses,
  useProjectPullRequestCommits,
  useProjectPullRequestFiles,
  useProjectPullRequestReviews
} from '../hooks/use-project-pull-requests'

export function PullRequestReviewSections({
  projectId,
  number
}: {
  projectId: string
  number: number
}): React.JSX.Element {
  return (
    <div className="space-y-8">
      <CommitsSection projectId={projectId} number={number} />
      <FilesSection projectId={projectId} number={number} />
      <ChecksSection projectId={projectId} number={number} />
      <ReviewsSection projectId={projectId} number={number} />
    </div>
  )
}

function CommitsSection({
  projectId,
  number
}: {
  projectId: string
  number: number
}): React.JSX.Element {
  const [page, setPage] = useState(1)
  const query = useProjectPullRequestCommits(projectId, number, page)
  const commits = query.isError ? undefined : query.data

  return (
    <section className="space-y-3" aria-label="Pull Request commits">
      <h3 className="font-semibold">Commits</h3>
      {query.isPending ? <Loading label="Loading commits…" /> : null}
      {query.isError ? (
        <ErrorState
          message={githubReadErrorMessage(query.error, 'Pull Request commits')}
          onRetry={query.refetch}
        />
      ) : null}
      {commits?.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No commits were returned.</p>
      ) : null}
      {commits?.items.map((commit) => (
        <CommitCard key={commit.sha} commit={commit} />
      ))}
      {commits ? (
        <Pagination
          label="Commit pages"
          page={page}
          hasNextPage={commits.hasNextPage}
          fetching={query.isFetching}
          onPageChange={setPage}
        />
      ) : null}
    </section>
  )
}

function CommitCard({ commit }: { commit: GitHubPullRequestCommit }): React.JSX.Element {
  return (
    <article className="space-y-2 rounded-lg border p-4">
      <p className="whitespace-pre-wrap text-sm">{commit.message}</p>
      <p className="font-mono text-xs text-muted-foreground">
        {commit.sha.slice(0, 12)} · {commit.author?.login ?? 'unlinked author'}
        {commit.authoredAt ? ` · ${new Date(commit.authoredAt).toLocaleString()}` : ''}
      </p>
    </article>
  )
}

function FilesSection({
  projectId,
  number
}: {
  projectId: string
  number: number
}): React.JSX.Element {
  const [page, setPage] = useState(1)
  const query = useProjectPullRequestFiles(projectId, number, page)
  const files = query.isError ? undefined : query.data

  return (
    <section className="space-y-3" aria-label="Changed files">
      <h3 className="font-semibold">Changed files</h3>
      {query.isPending ? <Loading label="Loading changed files…" /> : null}
      {query.isError ? (
        <ErrorState
          message={githubReadErrorMessage(query.error, 'changed files')}
          onRetry={query.refetch}
        />
      ) : null}
      {files?.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No changed files were returned.</p>
      ) : null}
      {files?.items.map((file) => (
        <FileCard key={`${file.sha}:${file.filename}`} file={file} />
      ))}
      {files ? (
        <Pagination
          label="Changed file pages"
          page={page}
          hasNextPage={files.hasNextPage}
          fetching={query.isFetching}
          onPageChange={setPage}
        />
      ) : null}
    </section>
  )
}

function FileCard({ file }: { file: GitHubPullRequestFile }): React.JSX.Element {
  return (
    <article className="overflow-hidden rounded-lg border">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-3">
        <div>
          <p className="font-mono text-xs">{file.filename}</p>
          {file.previousFilename ? (
            <p className="text-xs text-muted-foreground">renamed from {file.previousFilename}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Badge variant="outline">{file.status}</Badge>
          <span className="text-emerald-600">+{file.additions}</span>
          <span className="text-destructive">−{file.deletions}</span>
        </div>
      </header>
      <Patch patch={file.patch} />
    </article>
  )
}

function Patch({ patch }: { patch: GitHubPullRequestPatch }): React.JSX.Element {
  if (patch.status === 'binary') {
    return <Fallback>Binary file — no text patch is available.</Fallback>
  }
  if (patch.status === 'omitted') {
    return (
      <Fallback>GitHub omitted this patch, usually because the text diff is too large.</Fallback>
    )
  }
  if (patch.status === 'unavailable') {
    return <Fallback>This patch is unavailable from GitHub.</Fallback>
  }
  return (
    <div>
      {patch.truncated ? (
        <p className="border-b bg-amber-500/10 px-4 py-2 text-xs">
          GitHub returned a truncated patch. Review the complete diff on GitHub.
        </p>
      ) : null}
      <pre className="max-h-96 overflow-auto whitespace-pre p-4 text-xs">{patch.text}</pre>
    </div>
  )
}

function Fallback({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <p className="p-4 text-sm text-muted-foreground">{children}</p>
}

function ChecksSection({
  projectId,
  number
}: {
  projectId: string
  number: number
}): React.JSX.Element {
  const [checksPage, setChecksPage] = useState(1)
  const [statusesPage, setStatusesPage] = useState(1)
  const checks = useProjectPullRequestCheckRuns(projectId, number, checksPage)
  const statuses = useProjectPullRequestCommitStatuses(projectId, number, statusesPage)
  const currentChecks = checks.isError ? undefined : checks.data
  const currentStatuses = statuses.isError ? undefined : statuses.data

  return (
    <section className="space-y-5" aria-label="Checks and statuses">
      <div className="space-y-3">
        <h3 className="font-semibold">Checks and Actions</h3>
        {checks.isPending ? <Loading label="Loading checks…" /> : null}
        {checks.isError ? (
          <ErrorState
            message={githubReadErrorMessage(checks.error, 'checks and Actions results')}
            onRetry={checks.refetch}
          />
        ) : null}
        {currentChecks?.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No check runs were reported.</p>
        ) : null}
        {currentChecks?.items.map((check) => (
          <article
            key={check.id}
            className="flex items-center justify-between gap-3 rounded-lg border p-3"
          >
            <div>
              <p className="text-sm font-medium">{check.name}</p>
              <p className="text-xs text-muted-foreground">
                {check.appName ?? 'Unknown check provider'}
              </p>
            </div>
            <Badge variant={check.conclusion === 'success' ? 'default' : 'secondary'}>
              {check.conclusion ?? check.status}
            </Badge>
          </article>
        ))}
        {currentChecks ? (
          <Pagination
            label="Check run pages"
            page={checksPage}
            hasNextPage={currentChecks.hasNextPage}
            fetching={checks.isFetching}
            onPageChange={setChecksPage}
          />
        ) : null}
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold">Commit statuses</h4>
        {statuses.isPending ? <Loading label="Loading commit statuses…" /> : null}
        {statuses.isError ? (
          <ErrorState
            message={githubReadErrorMessage(statuses.error, 'commit statuses')}
            onRetry={statuses.refetch}
          />
        ) : null}
        {currentStatuses?.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No commit statuses were reported.</p>
        ) : null}
        {currentStatuses?.items.map((status) => (
          <article
            key={status.id}
            className="flex items-center justify-between gap-3 rounded-lg border p-3"
          >
            <div>
              <p className="text-sm font-medium">{status.context}</p>
              {status.description ? (
                <p className="text-xs text-muted-foreground">{status.description}</p>
              ) : null}
            </div>
            <Badge variant={status.state === 'success' ? 'default' : 'secondary'}>
              {status.state}
            </Badge>
          </article>
        ))}
        {currentStatuses ? (
          <Pagination
            label="Commit status pages"
            page={statusesPage}
            hasNextPage={currentStatuses.hasNextPage}
            fetching={statuses.isFetching}
            onPageChange={setStatusesPage}
          />
        ) : null}
      </div>
    </section>
  )
}

function ReviewsSection({
  projectId,
  number
}: {
  projectId: string
  number: number
}): React.JSX.Element {
  const [page, setPage] = useState(1)
  const query = useProjectPullRequestReviews(projectId, number, page)
  const reviews = query.isError ? undefined : query.data

  return (
    <section className="space-y-3" aria-label="Submitted reviews">
      <h3 className="font-semibold">Submitted reviews</h3>
      {query.isPending ? <Loading label="Loading reviews…" /> : null}
      {query.isError ? (
        <ErrorState
          message={githubReadErrorMessage(query.error, 'submitted reviews')}
          onRetry={query.refetch}
        />
      ) : null}
      {reviews?.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No submitted reviews yet.</p>
      ) : null}
      {reviews?.items.map((review) => (
        <article key={review.id} className="space-y-2 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">{review.author?.login ?? 'ghost'}</p>
            <Badge variant={review.state === 'approved' ? 'default' : 'secondary'}>
              {review.state.replace('_', ' ')}
            </Badge>
          </div>
          {review.body ? <p className="whitespace-pre-wrap text-sm">{review.body}</p> : null}
        </article>
      ))}
      {reviews ? (
        <Pagination
          label="Review pages"
          page={page}
          hasNextPage={reviews.hasNextPage}
          fetching={query.isFetching}
          onPageChange={setPage}
        />
      ) : null}
    </section>
  )
}

function Pagination({
  label,
  page,
  hasNextPage,
  fetching,
  onPageChange
}: {
  label: string
  page: number
  hasNextPage: boolean
  fetching: boolean
  onPageChange: (page: number) => void
}): React.JSX.Element {
  return (
    <nav className="flex items-center justify-between" aria-label={label}>
      <Button
        variant="outline"
        size="sm"
        disabled={page === 1 || fetching}
        onClick={() => onPageChange(page - 1)}
      >
        Previous
      </Button>
      <span className="text-xs text-muted-foreground">Page {page}</span>
      <Button
        variant="outline"
        size="sm"
        disabled={!hasNextPage || fetching}
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </Button>
    </nav>
  )
}

function Loading({ label }: { label: string }): React.JSX.Element {
  return (
    <p className="rounded-lg border p-4 text-sm text-muted-foreground" role="status">
      {label}
    </p>
  )
}

function ErrorState({
  message,
  onRetry
}: {
  message: string
  onRetry: () => unknown
}): React.JSX.Element {
  return (
    <div className="space-y-2 rounded-lg border border-destructive/40 p-4" role="alert">
      <p className="text-sm">{message}</p>
      <Button variant="outline" size="sm" onClick={() => void onRetry()}>
        Retry
      </Button>
    </div>
  )
}
