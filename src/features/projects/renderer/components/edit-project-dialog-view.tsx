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

export type EditProjectDialogViewProps = {
  project: Project | null
  open: boolean
  name: string
  path: string
  error: string | null
  isSaving: boolean
  onOpenChange: (open: boolean) => void
  onNameChange: (name: string) => void
  onPathChange: (path: string) => void
  onSave: () => void
}

export function EditProjectDialogView({
  project,
  open,
  name,
  path,
  error,
  isSaving,
  onOpenChange,
  onNameChange,
  onPathChange,
  onSave
}: EditProjectDialogViewProps): React.JSX.Element {
  const { t } = useTranslation()

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
              onChange={(event) => onNameChange(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="edit-project-path">
              {t('projects.edit.pathLabel')}
            </label>
            <Input
              id="edit-project-path"
              value={path}
              onChange={(event) => onPathChange(event.target.value)}
            />
          </div>
        </div>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button disabled={isSaving || !project || !name.trim() || !path.trim()} onClick={onSave}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
