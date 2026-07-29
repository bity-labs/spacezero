import { useState } from 'react'

import { DiffViewer } from '@renderer/components/diff-viewer'

import { Badge } from '../../../../renderer/src/components/ui/badge'
import { Button } from '../../../../renderer/src/components/ui/button'
import type { GitHubPullRequestCommit, GitHubPullRequestFile } from '../../shared'
import { githubReadErrorMessage } from '../github-error-messages'
import {
  useProjectPullRequestCommitList,
  useProjectPullRequestFiles
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
  const query = useProjectPullRequestCommitList(projectId, number)
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
      {commits?.length === 0 ? (
        <p className="text-sm text-muted-foreground">No commits were returned.</p>
      ) : null}
      {commits?.map((commit) => (
        <CommitCard key={commit.sha} commit={commit} />
      ))}
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
      <Patch file={file} />
    </article>
  )
}

function Patch({ file }: { file: GitHubPullRequestFile }): React.JSX.Element {
  const patch = file.patch
  if (patch.status === 'binary') {
    return <Fallback>Binary file — no text patch is available.</Fallback>
  }
  if (patch.status === 'omitted') {
    return (
      <Fallback>
        GitHub omitted this patch, usually because the text diff is too large or oversized.
      </Fallback>
    )
  }
  if (patch.status === 'unavailable') {
    return <Fallback>This patch is unavailable from GitHub.</Fallback>
  }
  if (patch.truncated) {
    return (
      <Fallback>GitHub returned a truncated patch. Review the complete diff on GitHub.</Fallback>
    )
  }

  return (
    <DiffViewer
      ariaLabel={`Diff for ${file.filename}`}
      className="border-t"
      items={[
        {
          id: `${file.sha}:${file.filename}`,
          path: file.filename,
          oldPath: file.previousFilename ?? undefined,
          patch: patch.text,
          collapsed: false,
          version: hashPatchVersion(file)
        }
      ]}
    />
  )
}

function Fallback({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <p className="border-t bg-muted/30 p-4 text-sm text-muted-foreground">{children}</p>
}

function hashPatchVersion(file: GitHubPullRequestFile): number {
  const patchText = file.patch.status === 'available' ? file.patch.text : file.patch.status
  const input = [
    file.sha,
    file.filename,
    file.previousFilename ?? '',
    file.status,
    file.additions,
    file.deletions,
    file.changes,
    patchText,
    file.patch.status === 'available' ? String(file.patch.truncated) : ''
  ].join('\0')
  let hash = 29
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) | 0
  }
  return hash
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
