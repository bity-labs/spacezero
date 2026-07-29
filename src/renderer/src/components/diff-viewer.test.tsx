import type { ReactNode } from 'react'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

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
  options: { theme?: string; themeType?: string; diffStyle?: string; hunkSeparators?: string }
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
          React.createElement('div', { key: 'name' }, item.fileDiff.name),
          React.createElement('pre', { key: 'patch' }, item.fileDiff.additionLines.join('\n')),
          React.createElement('div', { key: 'metadata' }, props.renderHeaderMetadata?.(item))
        ])
      )
    )
  })
  return { CodeView }
})

describe('DiffViewer', () => {
  it('wraps Pierre CodeView for controlled multi-file split diff lists', async () => {
    codeViewCalls.length = 0
    document.documentElement.classList.add('dark')

    render(
      <DiffViewer
        items={[
          {
            id: 'readme',
            path: 'README.md',
            patch:
              'diff --git a/README.md b/README.md\n@@ -1 +1 @@\n-old\n+new\n'
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
        theme: 'pierre-dark',
        themeType: 'dark',
        diffStyle: 'split',
        hunkSeparators: 'line-info-basic'
      }
    })
    expect(call?.items.map((item) => item.id)).toEqual(['readme', 'renamed'])
    expect(call?.items[1]?.fileDiff.prevName).toBe('old.ts')
    expect(screen.getByText('renamed from old.ts')).toBeInTheDocument()

    document.documentElement.classList.remove('dark')
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
    expect(codeViewCalls[0]?.items[0]?.fileDiff).toMatchObject({
      name: 'new-note.md',
      type: 'new'
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
    expect(screen.getByText('Text diff could not be rendered.', { exact: false })).toHaveTextContent(
      'broken.txt: Text diff could not be rendered.'
    )
    expect(codeViewCalls).toHaveLength(0)
  })
})
