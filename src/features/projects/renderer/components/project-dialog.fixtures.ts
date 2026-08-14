import type { AddProjectDialogViewProps } from './add-project-dialog-view'
import type { EditProjectDialogViewProps } from './edit-project-dialog-view'
import type { Project } from '../../shared'

const noOp = (): void => undefined

const project: Project = {
  id: 'project-1',
  name: 'Space Zero',
  path: '/Users/builder/Projects/spacezero',
  agentResourcesTrusted: false,
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z'
}

export const addProjectDefaultFixture = {
  open: true,
  selectedPath: 'empty',
  name: '',
  error: null,
  agentResourcesTrusted: false,
  isSaving: false,
  githubSetupContent: null,
  onOpenChange: noOp,
  onCancel: noOp,
  onSelectPath: noOp,
  onNameChange: noOp,
  onAgentResourcesTrustedChange: noOp,
  onCreateEmptyProject: noOp,
  onAddFolderProject: noOp
} satisfies AddProjectDialogViewProps

export const addProjectSavingFixture = {
  ...addProjectDefaultFixture,
  name: 'Agent Workspace',
  agentResourcesTrusted: true,
  isSaving: true
} satisfies AddProjectDialogViewProps

export const addProjectErrorFixture = {
  ...addProjectDefaultFixture,
  name: 'Agent Workspace',
  error: 'Could not create project.'
} satisfies AddProjectDialogViewProps

export const editProjectDefaultFixture = {
  project,
  open: true,
  name: project.name,
  path: project.path,
  error: null,
  isSaving: false,
  onOpenChange: noOp,
  onNameChange: noOp,
  onPathChange: noOp,
  onSave: noOp
} satisfies EditProjectDialogViewProps

export const editProjectSavingFixture = {
  ...editProjectDefaultFixture,
  name: 'Space Zero Desktop',
  isSaving: true
} satisfies EditProjectDialogViewProps

export const editProjectErrorFixture = {
  ...editProjectDefaultFixture,
  name: 'Space Zero Desktop',
  error: 'Could not update project.'
} satisfies EditProjectDialogViewProps
