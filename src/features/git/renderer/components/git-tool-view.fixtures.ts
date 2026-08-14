import type { GitToolViewProps } from './git-tool-view'

const noop = (): void => undefined

const baseActions = {
  commit: true,
  'commit-and-push': true,
  'commit-and-create-pr': true
}

const commitReadyFooter = {
  kind: 'commit',
  actionAvailability: baseActions,
  actions: ['commit-and-push', 'commit-and-create-pr', 'commit'],
  actionsReady: true,
  busy: false,
  instructions: '',
  menuOpen: false,
  primaryAction: 'commit-and-push',
  primaryDisabled: false,
  onInstructionsChange: noop,
  onMenuOpenChange: noop,
  onPrimaryActionChange: noop,
  onSubmit: noop
} satisfies NonNullable<GitToolViewProps['footer']>

export const changedFile = {
  path: 'src/features/git/renderer/components/git-tool-view.tsx',
  kind: 'modified',
  binary: false,
  large: false,
  diff: [
    'diff --git a/src/features/git/renderer/components/git-tool-view.tsx b/src/features/git/renderer/components/git-tool-view.tsx',
    '--- a/src/features/git/renderer/components/git-tool-view.tsx',
    '+++ b/src/features/git/renderer/components/git-tool-view.tsx',
    '@@ -1,3 +1,4 @@',
    " import type { GitReviewState } from '../../shared'",
    "+import { GitDiffCardView } from './git-diff-card-view'",
    ' ',
    ' export function GitToolView() {'
  ].join('\n')
} as const

export const newFile = {
  path: 'src/features/git/renderer/components/git-tool-view.stories.tsx',
  kind: 'untracked',
  binary: false,
  large: false,
  diff: [
    'diff --git a/src/features/git/renderer/components/git-tool-view.stories.tsx b/src/features/git/renderer/components/git-tool-view.stories.tsx',
    'new file mode 100644',
    '--- /dev/null',
    '+++ b/src/features/git/renderer/components/git-tool-view.stories.tsx',
    '@@ -0,0 +1,3 @@',
    "+import type { Meta } from '@storybook/react-vite'",
    '+',
    '+export default {} satisfies Meta'
  ].join('\n')
} as const

export const deletedFile = {
  path: 'src/features/git/legacy-git-panel.tsx',
  kind: 'deleted',
  binary: false,
  large: false,
  diff: [
    'diff --git a/src/features/git/legacy-git-panel.tsx b/src/features/git/legacy-git-panel.tsx',
    'deleted file mode 100644',
    '--- a/src/features/git/legacy-git-panel.tsx',
    '+++ /dev/null',
    '@@ -1,3 +0,0 @@',
    '-export function LegacyGitPanel() {',
    '-  return null',
    '-}'
  ].join('\n')
} as const

export const renamedFile = {
  path: 'src/features/git/renderer/components/git-tool-view.tsx',
  oldPath: 'src/features/git/renderer/components/git-panel.tsx',
  kind: 'renamed',
  binary: false,
  large: false,
  diff: [
    'diff --git a/src/features/git/renderer/components/git-panel.tsx b/src/features/git/renderer/components/git-tool-view.tsx',
    'similarity index 88%',
    'rename from src/features/git/renderer/components/git-panel.tsx',
    'rename to src/features/git/renderer/components/git-tool-view.tsx',
    '--- a/src/features/git/renderer/components/git-panel.tsx',
    '+++ b/src/features/git/renderer/components/git-tool-view.tsx',
    '@@ -1 +1 @@',
    '-export function GitPanel() {}',
    '+export function GitToolView() {}'
  ].join('\n')
} as const

export const binaryFile = {
  path: 'resources/git-diff-preview.png',
  kind: 'modified',
  binary: true,
  large: false,
  diff: null
} as const

export const conflictFile = {
  path: 'src/app.tsx',
  kind: 'conflicted',
  binary: false,
  large: false,
  diff: [
    'diff --git a/src/app.tsx b/src/app.tsx',
    '--- a/src/app.tsx',
    '+++ b/src/app.tsx',
    '@@ -1,3 +1,7 @@',
    '+<<<<<<< HEAD',
    ' export const route = createRoute()',
    '+=======',
    '+export const route = createWorkspaceRoute()',
    '+>>>>>>> feature/workspace',
    ' export const app = route'
  ].join('\n')
} as const

const baseGitToolFixture = {
  filter: 'uncommitted',
  state: {
    status: 'ok',
    branch: 'issue-457-git-diff-stories',
    upstream: {
      kind: 'tracked',
      name: 'origin/issue-457-git-diff-stories',
      ahead: 1,
      behind: 0
    },
    files: [changedFile]
  },
  isRefreshing: false,
  expandedPaths: new Set([changedFile.path]),
  onFilterChange: noop,
  onRefresh: noop,
  onToggleFile: noop
} satisfies GitToolViewProps

export const changedFilesGitToolFixture = baseGitToolFixture

export const cleanRepositoryGitToolFixture = {
  ...baseGitToolFixture,
  state: {
    status: 'clean',
    branch: 'main',
    upstream: { kind: 'tracked', name: 'origin/main', ahead: 0, behind: 0 },
    files: []
  },
  expandedPaths: new Set<string>()
} satisfies GitToolViewProps

export const newFileGitToolFixture = {
  ...baseGitToolFixture,
  state: { ...baseGitToolFixture.state, files: [newFile] },
  expandedPaths: new Set([newFile.path])
} satisfies GitToolViewProps

export const deletedFileGitToolFixture = {
  ...baseGitToolFixture,
  state: { ...baseGitToolFixture.state, files: [deletedFile] },
  expandedPaths: new Set([deletedFile.path])
} satisfies GitToolViewProps

export const renamedFileGitToolFixture = {
  ...baseGitToolFixture,
  state: { ...baseGitToolFixture.state, files: [renamedFile] },
  expandedPaths: new Set([renamedFile.path])
} satisfies GitToolViewProps

export const binaryFileGitToolFixture = {
  ...baseGitToolFixture,
  state: { ...baseGitToolFixture.state, files: [binaryFile] },
  expandedPaths: new Set([binaryFile.path])
} satisfies GitToolViewProps

export const conflictGitToolFixture = {
  ...baseGitToolFixture,
  state: { ...baseGitToolFixture.state, files: [conflictFile] },
  expandedPaths: new Set([conflictFile.path]),
  footer: {
    kind: 'conflict',
    disabled: false,
    instructions: 'Keep the workspace route and reconcile the loader behavior.',
    onInstructionsChange: noop,
    onResolve: noop
  }
} satisfies GitToolViewProps

export const noRepositoryGitToolFixture = {
  ...baseGitToolFixture,
  state: {
    status: 'missing-worktree',
    message: 'No Git repository is available for this workspace context.'
  },
  expandedPaths: new Set<string>()
} satisfies GitToolViewProps

export const loadingGitToolFixture = {
  ...baseGitToolFixture,
  state: null,
  isRefreshing: true,
  expandedPaths: new Set<string>()
} satisfies GitToolViewProps

export const errorGitToolFixture = {
  ...baseGitToolFixture,
  state: {
    status: 'git-error',
    message: 'Git could not read repository status. Check the repository and try again.'
  },
  expandedPaths: new Set<string>()
} satisfies GitToolViewProps

export const commitReadyGitToolFixture = {
  ...baseGitToolFixture,
  footer: commitReadyFooter
} satisfies GitToolViewProps

export const commitDisabledGitToolFixture = {
  ...cleanRepositoryGitToolFixture,
  footer: {
    ...commitReadyFooter,
    actionAvailability: {
      commit: false,
      'commit-and-push': false,
      'commit-and-create-pr': false
    },
    primaryDisabled: true
  }
} satisfies GitToolViewProps
