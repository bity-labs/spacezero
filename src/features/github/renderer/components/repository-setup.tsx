import { useEffect, useRef, useState } from 'react'

import type { GitHubCloneProgress, GitHubRepositorySetupOption } from '../../shared'
import { Button } from '@renderer/components/ui/button'

export function RepositorySetup({
  onProjectReady
}: {
  onProjectReady: (projectId: string) => void | Promise<void>
}): React.JSX.Element {
  const [options, setOptions] = useState<GitHubRepositorySetupOption[] | null>(null)
  const [selectedRepositoryId, setSelectedRepositoryId] = useState<string | null>(null)
  const [activeOperationId, setActiveOperationId] = useState<string | null>(null)
  const activeOperationRef = useRef<string | null>(null)
  const [progress, setProgress] = useState<GitHubCloneProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)

  useEffect(() => {
    let current = true
    window.spacezero.github
      .listRepositorySetupOptions()
      .then((nextOptions) => {
        if (current) setOptions(nextOptions)
      })
      .catch(() => {
        if (current) setError('Unable to load authorized repositories.')
      })

    const unsubscribe = window.spacezero.github.onCloneProgress((event) => {
      if (event.operationId !== activeOperationRef.current) return
      setProgress(event)
      if (event.status === 'complete' && event.projectId) {
        void onProjectReady(event.projectId)
      }
    })

    return () => {
      current = false
      unsubscribe()
    }
  }, [onProjectReady])

  const selectedOption = options?.find((option) => option.repository.id === selectedRepositoryId)
  const cloneRunning = progress?.status === 'starting' || progress?.status === 'cloning'
  const cloneFailed = progress?.status === 'failed' || progress?.status === 'cancelled'

  async function startClone(): Promise<void> {
    if (!selectedRepositoryId) return
    setIsStarting(true)
    setError(null)
    setProgress(null)

    try {
      const result = await window.spacezero.github.startClone({
        repositoryId: selectedRepositoryId
      })
      if (result.status === 'already-added') {
        await onProjectReady(result.projectId)
        return
      }
      activeOperationRef.current = result.operationId
      setActiveOperationId(result.operationId)
      setProgress({
        operationId: result.operationId,
        status: 'starting',
        message: 'Preparing managed clone…'
      })
    } catch {
      setError('Unable to start the clone. Check repository access and destination, then retry.')
    } finally {
      setIsStarting(false)
    }
  }

  async function cancelClone(): Promise<void> {
    if (!activeOperationId) return
    await window.spacezero.github.cancelClone({ operationId: activeOperationId })
  }

  if (!options && !error) {
    return <p className="text-sm text-muted-foreground">Loading authorized repositories…</p>
  }

  return (
    <div className="space-y-4">
      {options?.length === 0 ? (
        <p className="rounded-md border p-3 text-sm text-muted-foreground">
          No authorized GitHub repositories are available.
        </p>
      ) : (
        <fieldset className="max-h-72 space-y-2 overflow-auto pr-1">
          <legend className="mb-2 text-sm font-medium">Choose one repository</legend>
          {options?.map((option) => (
            <label
              key={option.repository.id}
              className="flex cursor-pointer items-start justify-between gap-3 rounded-md border p-3"
            >
              <span className="flex min-w-0 items-start gap-3">
                <input
                  type="radio"
                  name="github-project-repository"
                  checked={selectedRepositoryId === option.repository.id}
                  onChange={() => setSelectedRepositoryId(option.repository.id)}
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {option.repository.fullName}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {option.repository.isPrivate ? 'Private' : 'Public'} ·{' '}
                    {option.repository.defaultBranch}
                  </span>
                </span>
              </span>
              {option.existingProject ? (
                <span className="shrink-0 text-xs font-medium text-muted-foreground">
                  Already added
                </span>
              ) : null}
            </label>
          ))}
        </fieldset>
      )}

      {progress ? (
        <div className="space-y-2" role="status" aria-live="polite">
          <p className="text-sm text-muted-foreground">
            {progress.message}
            {progress.percent === undefined ? '' : ` ${progress.percent}%`}
          </p>
          {cloneRunning ? (
            <Button variant="outline" size="sm" onClick={() => void cancelClone()}>
              Cancel clone
            </Button>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button
        disabled={!selectedOption || isStarting || cloneRunning}
        onClick={() => void startClone()}
      >
        {isStarting
          ? 'Starting…'
          : cloneFailed
            ? 'Retry clone'
            : selectedOption?.existingProject
              ? 'Open Project'
              : 'Clone repository'}
      </Button>
    </div>
  )
}
