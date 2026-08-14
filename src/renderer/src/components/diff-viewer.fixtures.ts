import type { DiffViewerItem } from './diff-viewer'

export const changedDiffViewerItems = [
  {
    id: 'changed-settings',
    path: 'src/settings.ts',
    patch: [
      'diff --git a/src/settings.ts b/src/settings.ts',
      '--- a/src/settings.ts',
      '+++ b/src/settings.ts',
      '@@ -1,4 +1,4 @@',
      ' export const settings = {',
      "-  theme: 'light',",
      "+  theme: 'system',",
      '   fontSize: 14',
      ' }'
    ].join('\n'),
    changeMetadata: { status: 'modified', additions: 1, deletions: 1 }
  }
] satisfies DiffViewerItem[]

export const newDiffViewerItems = [
  {
    id: 'new-view',
    path: 'src/git-tool-view.tsx',
    patch: [
      'diff --git a/src/git-tool-view.tsx b/src/git-tool-view.tsx',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/src/git-tool-view.tsx',
      '@@ -0,0 +1,3 @@',
      '+export function GitToolView() {',
      '+  return <section aria-label="Git Diff" />',
      '+}'
    ].join('\n'),
    changeMetadata: { status: 'added', additions: 3, deletions: 0 }
  }
] satisfies DiffViewerItem[]

export const deletedDiffViewerItems = [
  {
    id: 'deleted-panel',
    path: 'src/legacy-git-panel.tsx',
    patch: [
      'diff --git a/src/legacy-git-panel.tsx b/src/legacy-git-panel.tsx',
      'deleted file mode 100644',
      '--- a/src/legacy-git-panel.tsx',
      '+++ /dev/null',
      '@@ -1,3 +0,0 @@',
      '-export function LegacyGitPanel() {',
      '-  return null',
      '-}'
    ].join('\n'),
    changeMetadata: { status: 'deleted', additions: 0, deletions: 3 }
  }
] satisfies DiffViewerItem[]

export const renamedDiffViewerItems = [
  {
    id: 'renamed-panel',
    path: 'src/git-tool-view.tsx',
    oldPath: 'src/git-panel.tsx',
    patch: [
      'diff --git a/src/git-panel.tsx b/src/git-tool-view.tsx',
      'similarity index 89%',
      'rename from src/git-panel.tsx',
      'rename to src/git-tool-view.tsx',
      '--- a/src/git-panel.tsx',
      '+++ b/src/git-tool-view.tsx',
      '@@ -1 +1 @@',
      '-export function GitPanel() {}',
      '+export function GitToolView() {}'
    ].join('\n'),
    changeMetadata: { status: 'renamed', additions: 1, deletions: 1 }
  }
] satisfies DiffViewerItem[]

export const stackedDiffViewerItems = [
  ...changedDiffViewerItems,
  ...newDiffViewerItems,
  ...deletedDiffViewerItems,
  ...renamedDiffViewerItems
] satisfies DiffViewerItem[]

export const collapsedDiffViewerItems = changedDiffViewerItems.map((item) => ({
  ...item,
  collapsed: true
})) satisfies DiffViewerItem[]

export const unrenderableDiffViewerItems = [
  {
    id: 'binary-placeholder',
    path: 'resources/preview.png',
    patch: 'Binary files differ'
  }
] satisfies DiffViewerItem[]
