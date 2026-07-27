import { useEffect, useRef, useState } from 'react'

import type { GitHubCloneProgress, GitHubRepositorySetupOption } from '../../shared'
import { AgentResourceTrustCheckbox } from '../../../projects/renderer/components/agent-resource-trust-checkbox'
import { Button } from '@renderer/components/ui/button'

export function RepositorySetup({
  onProjectReady,
  onBusyChange,
  agentResourcesTrusted,
  onAgentResourcesTrustedChange
}: {
  onProjectReady: (projectId: string) => void | Promise<void>
  onBusyChange?: (busy: boolean) => void
  agentResourcesTrusted?: boolean
  onAgentResourcesTrustedChange?: (trusted: boolean) => void
}): React.JSX.Element {
  const [options, setOptions] = useState<GitHubRepositorySetupOption[] | null>(null)
  const [selectedRepositoryId, setSelectedRepositoryId] = useState<string | null>(null)
  const [selectedExistingProjectId, setSelectedExistingProjectId] = useState<string | null>(null)
  const [activeOperationId, setActiveOperationId] = useState<string | null>(null)
  const activeOperationRef = useRef<string | null>(null)
  const mountedRef = useRef(true)
  const [progress, setProgress] = useState<GitHubCloneProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [uncontrolledAgentResourcesTrusted, setUncontrolledAgentResourcesTrusted] = useState(false)
  const onProjectReadyRef = useRef(onProjectReady)

  useEffect(() => {
    onProjectReadyRef.current = onProjectReady
  }, [onProjectReady])

  useEffect(() => {
    let current = true
    mountedRef.current = true
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
      if (
        event.status === 'complete' ||
        event.status === 'failed' ||
        event.status === 'cancelled'
      ) {
        activeOperationRef.current = null
        setActiveOperationId(null)
      }
      if (event.status === 'complete' && event.projectId) {
        void onProjectReadyRef.current(event.projectId)
      }
    })

    return () => {
      current = false
      mountedRef.current = false
      unsubscribe()
      const operationId = activeOperationRef.current
      activeOperationRef.current = null
      if (operationId) void window.spacezero.github.cancelClone({ operationId })
    }
  }, [])

  const selectedOption = options?.find((option) => option.repository.id === selectedRepositoryId)
  const matchingProjects = selectedOption?.matchingProjects ?? []
  const selectedMatchId =
    matchingProjects.length === 1 ? matchingProjects[0].id : selectedExistingProjectId
  const cloneRunning = progress?.status === 'starting' || progress?.status === 'cloning'
  const cloneFailed = progress?.status === 'failed' || progress?.status === 'cancelled'
  const busy = isStarting || cloneRunning
  const effectiveAgentResourcesTrusted =
    agentResourcesTrusted ?? uncontrolledAgentResourcesTrusted

  useEffect(() => {
    onBusyChange?.(busy)
    return () => onBusyChange?.(false)
  }, [busy, onBusyChange])

  async function startClone(): Promise<void> {
    if (!selectedRepositoryId || activeOperationRef.current) return
    setIsStarting(true)
    setError(null)
    setProgress(null)

    try {
      const result = await window.spacezero.github.startClone({
        repositoryId: selectedRepositoryId,
        ...(selectedMatchId ? { existingProjectId: selectedMatchId } : {}),
        ...(selectedMatchId
          ? {}
          : { agentResourcesTrusted: effectiveAgentResourcesTrusted })
      })
      if (!mountedRef.current) {
        if (result.status === 'started') {
          await window.spacezero.github.cancelClone({ operationId: result.operationId })
        }
        return
      }
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
                  disabled={busy}
                  onChange={() => {
                    if (busy) return
                    setSelectedRepositoryId(option.repository.id)
                    setSelectedExistingProjectId(null)
                    setProgress(null)
                  }}
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
              ) : option.matchingProjects?.length ? (
                <span className="shrink-0 text-xs font-medium text-muted-foreground">
                  {option.matchingProjects.length === 1
                    ? 'Local Project match'
                    : `${option.matchingProjects.length} local matches`}
                </span>
              ) : null}
            </label>
          ))}
        </fieldset>
      )}

      {matchingProjects.length > 1 ? (
        <fieldset className="space-y-2 rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">Choose matching local Project</legend>
          <p className="text-xs text-muted-foreground">
            More than one registered Project has this exact GitHub remote. Choose which one to link;
            Space Zero will not clone a duplicate.
          </p>
          {matchingProjects.map((project) => (
            <label key={project.id} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="github-existing-project"
                checked={selectedExistingProjectId === project.id}
                disabled={busy}
                onChange={() => setSelectedExistingProjectId(project.id)}
              />
              {project.name}
            </label>
          ))}
        </fieldset>
      ) : null}

      {selectedOption && !selectedOption.existingProject && matchingProjects.length === 0 ? (
        <AgentResourceTrustCheckbox
          checked={effectiveAgentResourcesTrusted}
          disabled={busy}
          onCheckedChange={(trusted) => {
            setUncontrolledAgentResourcesTrusted(trusted)
            onAgentResourcesTrustedChange?.(trusted)
          }}
        />
      ) : null}

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
        disabled={
          !selectedOption ||
          isStarting ||
          cloneRunning ||
          (matchingProjects.length > 1 && !selectedExistingProjectId)
        }
        onClick={() => void startClone()}
      >
        {isStarting
          ? 'Starting…'
          : selectedOption?.existingProject
            ? 'Open Project'
            : matchingProjects.length > 0
              ? 'Link Project'
              : cloneFailed
                ? 'Retry clone'
                : 'Clone repository'}
      </Button>
    </div>
  )
}
