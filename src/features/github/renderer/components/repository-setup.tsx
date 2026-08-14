import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'

import type { GitHubCloneProgress, GitHubRepositorySetupOption } from '../../shared'
import { RepositorySetupView } from './repository-setup-view'

export function RepositorySetup({
  onProjectReady,
  onBusyChange,
  agentResourcesTrusted,
  onAgentResourcesTrustedChange,
  renderPrimaryAction
}: {
  onProjectReady: (projectId: string) => void | Promise<void>
  onBusyChange?: (busy: boolean) => void
  agentResourcesTrusted?: boolean
  onAgentResourcesTrustedChange?: (trusted: boolean) => void
  renderPrimaryAction?: (primaryAction: React.ReactNode) => React.ReactNode
}): React.JSX.Element {
  const navigate = useNavigate()
  const [options, setOptions] = useState<GitHubRepositorySetupOption[] | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
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

  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const filteredOptions = normalizedSearchQuery
    ? (options ?? []).filter(({ repository }) =>
        [repository.name, repository.fullName].some((value) =>
          value.toLowerCase().includes(normalizedSearchQuery)
        )
      )
    : (options ?? [])
  const selectedOption = filteredOptions.find(
    ({ repository }) => repository.id === selectedRepositoryId
  )
  const matchingProjects = selectedOption?.matchingProjects ?? []
  const selectedMatchId =
    matchingProjects.length === 1 ? matchingProjects[0].id : selectedExistingProjectId
  const cloneRunning = progress?.status === 'starting' || progress?.status === 'cloning'
  const busy = isStarting || cloneRunning
  const effectiveAgentResourcesTrusted =
    agentResourcesTrusted ?? uncontrolledAgentResourcesTrusted

  useEffect(() => {
    onBusyChange?.(busy)
    return () => onBusyChange?.(false)
  }, [busy, onBusyChange])

  async function startClone(): Promise<void> {
    if (!selectedOption || activeOperationRef.current) return
    setIsStarting(true)
    setError(null)
    setProgress(null)

    try {
      const result = await window.spacezero.github.startClone({
        repositoryId: selectedOption.repository.id,
        ...(selectedMatchId ? { existingProjectId: selectedMatchId } : {}),
        ...(selectedMatchId ? {} : { agentResourcesTrusted: effectiveAgentResourcesTrusted })
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

  return (
    <RepositorySetupView
      options={options}
      searchQuery={searchQuery}
      selectedRepositoryId={selectedRepositoryId}
      selectedExistingProjectId={selectedExistingProjectId}
      progress={progress}
      error={error}
      isStarting={isStarting}
      agentResourcesTrusted={effectiveAgentResourcesTrusted}
      onSearchQueryChange={setSearchQuery}
      onSelectRepository={(repositoryId) => {
        if (busy) return
        setSelectedRepositoryId(repositoryId)
        setSelectedExistingProjectId(null)
        setProgress(null)
      }}
      onSelectExistingProject={setSelectedExistingProjectId}
      onAgentResourcesTrustedChange={(trusted) => {
        setUncontrolledAgentResourcesTrusted(trusted)
        onAgentResourcesTrustedChange?.(trusted)
      }}
      onStart={() => void startClone()}
      onCancel={() => void cancelClone()}
      onConfigureAccess={() => void navigate({ to: '/settings', search: { section: 'account' } })}
      renderPrimaryAction={renderPrimaryAction}
    />
  )
}
