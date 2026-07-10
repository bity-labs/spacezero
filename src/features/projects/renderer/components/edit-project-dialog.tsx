import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { Project } from '../../shared'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'

type EditProjectDialogProps = {
  project: Project | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdateProject: (request: { id: string; name: string; path: string }) => Promise<Project>
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
      await onUpdateProject({ id: project.id, name, path })
      onOpenChange(false)
    } catch {
      setError(t('projects.edit.saveError'))
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('projects.edit.title')}</DialogTitle>
          <DialogDescription>{t('projects.edit.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="edit-project-name">
              {t('projects.edit.nameLabel')}
            </label>
            <Input
              id="edit-project-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="edit-project-path">
              {t('projects.edit.pathLabel')}
            </label>
            <Input
              id="edit-project-path"
              value={path}
              onChange={(event) => setPath(event.target.value)}
            />
          </div>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button disabled={isSaving || !name.trim() || !path.trim()} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
