import type { ReactNode } from 'react'

import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ColorModeProvider } from '../color-mode-provider'
import { DiffViewer } from './diff-viewer'

type MockCodeViewItem = {
  id: string
  type: string
  fileDiff: {
    name: string
    prevName?: string
    type: string
    additionLines: string[]
    hunks: unknown[]
  }
  version?: number
}

type MockCodeViewCall = {
  disableWorkerPool?: boolean
  items: MockCodeViewItem[]
  options: {
    theme?: string
    themeType?: string
    diffStyle?: string
    diffIndicators?: string
    hunkSeparators?: string
  }
  renderCustomHeader?: (item: MockCodeViewItem) => ReactNode
  renderHeaderPrefix?: (item: MockCodeViewItem) => ReactNode
  renderHeaderMetadata?: (item: MockCodeViewItem) => ReactNode
}

const { codeViewCalls } = vi.hoisted(() => ({
  codeViewCalls: [] as MockCodeViewCall[]
}))

vi.mock('@pierre/diffs/react', async () => {
  const React = await import('react')
  const CodeView = vi.fn((props) => {
    codeViewCalls.push(props)
    return React.createElement(
      'div',
      { 'data-testid': 'pierre-code-view' },
      props.items.map((item) =>
        React.createElement('section', { key: item.id }, [
          React.createElement('div', { key: 'header' }, [
            React.createElement(React.Fragment, { key: 'prefix' }, props.renderHeaderPrefix?.(item)),
            React.createElement('span', { key: 'name' }, item.fileDiff.name),
            React.createElement(React.Fragment, { key: 'custom' }, props.renderCustomHeader?.(item)),
            React.createElement(React.Fragment, { key: 'metadata' }, props.renderHeaderMetadata?.(item))
          ]),
          React.createElement('pre', { key: 'patch' }, item.fileDiff.additionLines.join('\n'))
        ])
      )
    )
  })
  return { CodeView }
})

describe('DiffViewer', () => {
  it('wraps Pierre CodeView for controlled multi-file stacked diff lists', async () => {
    codeViewCalls.length = 0
    document.documentElement.classList.add('dark')

    render(
      <DiffViewer
        items={[
          {
            id: 'readme',
            path: 'README.md',
            patch: 'diff --git a/README.md b/README.md\n@@ -1 +1 @@\n-old\n+new\n'
          },
          {
            id: 'renamed',
            path: 'new.ts',
            oldPath: 'old.ts',
            patch:
              'diff --git a/old.ts b/new.ts\nrename from old.ts\nrename to new.ts\n@@ -1 +1 @@\n-old\n+new\n'
          }
        ]}
      />
    )

    expect(await screen.findByTestId('pierre-code-view')).toBeInTheDocument()
    const call = codeViewCalls[0]
    expect(call).toMatchObject({
      disableWorkerPool: true,
      options: {
        theme: 'pierre-dark-soft',
        themeType: 'dark',
        diffStyle: 'unified',
        diffIndicators: 'none',
        hunkSeparators: 'line-info-basic'
      }
    })
    expect(call?.items.map((item) => item.id)).toEqual(['readme', 'renamed'])
    expect(call?.renderCustomHeader).toBeUndefined()
    expect(call?.items[1]?.fileDiff.prevName).toBe('old.ts')
    expect(screen.getByText('new.ts')).toBeInTheDocument()
    expect(screen.getByText('renamed from old.ts')).toBeInTheDocument()

    document.documentElement.classList.remove('dark')
  })

  it('uses the stronger Pierre dark theme in dark high contrast mode', async () => {
    codeViewCalls.length = 0
    window.spacezero.settings.getThemeSettings = async () => ({
      preference: 'dark-high-contrast',
      resolvedTheme: 'dark-high-contrast'
    })

    const { unmount } = render(
      <ColorModeProvider>
        <DiffViewer
          items={[
            {
              id: 'high-contrast',
              path: 'example.ts',
              patch:
                'diff --git a/example.ts b/example.ts\n@@ -1 +1 @@\n-const oldValue = false\n+const newValue = true\n'
            }
          ]}
        />
      </ColorModeProvider>
    )

    await waitFor(() =>
      expect(codeViewCalls.at(-1)?.options).toMatchObject({
        theme: 'pierre-dark',
        themeType: 'dark'
      })
    )

    unmount()
    document.documentElement.classList.remove('dark', 'dark-high-contrast')
  })

  it('normalizes untracked-file patches without hunk headers before handing them to CodeView', () => {
    codeViewCalls.length = 0

    render(
      <DiffViewer
        items={[
          {
            id: 'untracked',
            path: 'new-note.md',
            patch:
              'diff --git a/new-note.md b/new-note.md\nnew file mode 100644\n--- /dev/null\n+++ b/new-note.md\n+hello\n+world\n'
          }
        ]}
      />
    )

    expect(screen.getByTestId('pierre-code-view')).toBeInTheDocument()
    expect(codeViewCalls[0]).toMatchObject({
      options: { theme: 'pierre-light', themeType: 'light' },
      items: [{ fileDiff: { name: 'new-note.md', type: 'new' } }]
    })
    expect(codeViewCalls[0]?.items[0]?.fileDiff.hunks.length).toBeGreaterThan(0)
  })

  it('normalizes GitHub hunk-only patch text with the supplied file paths', () => {
    codeViewCalls.length = 0

    render(
      <DiffViewer
        items={[
          {
            id: 'pull-request-file',
            path: 'src/new-name.ts',
            oldPath: 'src/old-name.ts',
            patch: '@@ -1 +1 @@\n-old\n+new'
          }
        ]}
      />
    )

    expect(screen.getByTestId('pierre-code-view')).toBeInTheDocument()
    expect(codeViewCalls[0]?.items[0]?.fileDiff).toMatchObject({
      name: 'src/new-name.ts',
      prevName: 'src/old-name.ts'
    })
    expect(codeViewCalls[0]?.items[0]?.fileDiff.hunks.length).toBeGreaterThan(0)
  })

  it('shows bounded fallback messaging when a patch cannot be parsed', () => {
    codeViewCalls.length = 0

    render(
      <DiffViewer
        fallbackMessage="Text diff could not be rendered."
        items={[{ id: 'broken', path: 'broken.txt', patch: 'not a file patch' }]}
      />
    )

    expect(screen.queryByTestId('pierre-code-view')).not.toBeInTheDocument()
    expect(
      screen.getByText('Text diff could not be rendered.', { exact: false })
    ).toHaveTextContent('broken.txt: Text diff could not be rendered.')
    expect(codeViewCalls).toHaveLength(0)
  })
})
