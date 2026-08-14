import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { Project } from '../../shared'
import { EditProjectDialogView } from './edit-project-dialog-view'

type EditProjectDialogProps = {
  project: Project | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdateProject: (request: {
    id: string
    name: string
    path: string
    agentResourcesTrusted?: boolean
  }) => Promise<Project>
}

export function EditProjectDialog({
  project,
  open,
  onOpenChange,
  onUpdateProject
}: EditProjectDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [name, setName] = useState(project?.name ?? '')
  const [path, setPath] = useState(project?.path ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  async function save(): Promise<void> {
    if (!project) return
    setIsSaving(true)
    setError(null)
    try {
      await onUpdateProject({
        id: project.id,
        name,
        path,
        agentResourcesTrusted: project.agentResourcesTrusted === true
      })
      onOpenChange(false)
    } catch (error) {
      const message = String(error)
      setError(
        message.includes('project.pathChangeBlockedByManagedSessions')
          ? t('projects.edit.pathBlockedByManagedSessions')
          : message.includes('project.notGitRepository')
            ? t('projects.add.folderNotGit')
            : message.includes('project.repositoryHasNoCommits')
              ? t('projects.add.folderNoCommits')
              : t('projects.edit.saveError')
      )
      setIsSaving(false)
    }
  }

  return (
    <EditProjectDialogView
      project={project}
      open={open}
      name={name}
      path={path}
      error={error}
      isSaving={isSaving}
      onOpenChange={onOpenChange}
      onNameChange={setName}
      onPathChange={setPath}
      onSave={() => void save()}
    />
  )
}
