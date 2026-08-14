import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { RepositorySetup } from '../../../github/renderer'
import type { Project } from '../../shared'
import { AddProjectDialogView, type AddProjectSetupPath } from './add-project-dialog-view'
import { Button } from '@renderer/components/ui/button'
import { DialogFooter } from '@renderer/components/ui/dialog'

type AddProjectDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreateEmptyProject: (request: {
    name: string
    agentResourcesTrusted: boolean
  }) => Promise<Project>
  onAddFromFolder: (request: { agentResourcesTrusted: boolean }) => Promise<Project | null>
  onGitHubProjectReady: (projectId: string) => Promise<void>
}

export function AddProjectDialog({
  open,
  onOpenChange,
  onCreateEmptyProject,
  onAddFromFolder,
  onGitHubProjectReady
}: AddProjectDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [selectedPath, setSelectedPath] = useState<AddProjectSetupPath>('empty')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [agentResourcesTrusted, setAgentResourcesTrusted] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const reset = (): void => {
    setSelectedPath('empty')
    setName('')
    setError(null)
    setAgentResourcesTrusted(false)
    setIsSaving(false)
  }

  function handleOpenChange(nextOpen: boolean): void {
    onOpenChange(nextOpen)
    if (!nextOpen) reset()
  }

  async function createEmptyProject(): Promise<void> {
    setIsSaving(true)
    setError(null)
    try {
      await onCreateEmptyProject({ name, agentResourcesTrusted })
      reset()
      onOpenChange(false)
    } catch {
      setError(t('projects.add.saveError'))
      setIsSaving(false)
    }
  }

  async function finishGitHubProject(projectId: string): Promise<void> {
    await onGitHubProjectReady(projectId)
    reset()
    onOpenChange(false)
  }

  async function addFolderProject(): Promise<void> {
    setIsSaving(true)
    setError(null)
    try {
      const project = await onAddFromFolder({ agentResourcesTrusted })
      if (project) {
        reset()
        onOpenChange(false)
        return
      }
      setIsSaving(false)
    } catch (error) {
      const message = String(error)
      setError(
        message.includes('project.notGitRepository')
          ? t('projects.add.folderNotGit')
          : message.includes('project.repositoryHasNoCommits')
            ? t('projects.add.folderNoCommits')
            : t('projects.add.folderError')
      )
      setIsSaving(false)
    }
  }

  return (
    <AddProjectDialogView
      open={open}
      selectedPath={selectedPath}
      name={name}
      error={error}
      agentResourcesTrusted={agentResourcesTrusted}
      isSaving={isSaving}
      githubSetupContent={
        <RepositorySetup
          agentResourcesTrusted={agentResourcesTrusted}
          onAgentResourcesTrustedChange={setAgentResourcesTrusted}
          onProjectReady={finishGitHubProject}
          renderPrimaryAction={(primaryAction) => (
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              {primaryAction}
            </DialogFooter>
          )}
        />
      }
      onOpenChange={handleOpenChange}
      onCancel={() => onOpenChange(false)}
      onSelectPath={setSelectedPath}
      onNameChange={setName}
      onAgentResourcesTrustedChange={setAgentResourcesTrusted}
      onCreateEmptyProject={() => void createEmptyProject()}
      onAddFolderProject={() => void addFolderProject()}
    />
  )
}
