import type { KnowledgeBaseSetupScreenProps } from './knowledge-base-setup-screen'

const noOp = (): void => undefined

const setupFixture = {
  loading: false,
  error: null,
  isCreating: false,
  isCloneFormOpen: false,
  isCloning: false,
  gitUrl: '',
  onCreateNew: noOp,
  onOpenCloneForm: noOp,
  onGitUrlChange: noOp,
  onCancelClone: noOp,
  onCloneFromGit: noOp
} satisfies KnowledgeBaseSetupScreenProps

export const loadingKnowledgeBaseFixture = {
  ...setupFixture,
  loading: true
} satisfies KnowledgeBaseSetupScreenProps

export const notConfiguredKnowledgeBaseFixture = setupFixture

export const createNewKnowledgeBaseFixture = {
  ...setupFixture
} satisfies KnowledgeBaseSetupScreenProps

export const cloneFromRepositoryKnowledgeBaseFixture = {
  ...setupFixture,
  isCloneFormOpen: true,
  gitUrl: 'git@github.com:builder/knowledge-base.git'
} satisfies KnowledgeBaseSetupScreenProps

export const creatingKnowledgeBaseFixture = {
  ...setupFixture,
  isCreating: true
} satisfies KnowledgeBaseSetupScreenProps

export const cloningKnowledgeBaseFixture = {
  ...cloneFromRepositoryKnowledgeBaseFixture,
  isCloning: true
} satisfies KnowledgeBaseSetupScreenProps

export const setupErrorKnowledgeBaseFixture = {
  ...setupFixture,
  error: 'Space Zero could not create the Knowledge Base repository. Check the path and try again.'
} satisfies KnowledgeBaseSetupScreenProps
