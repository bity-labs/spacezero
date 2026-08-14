import type { TerminalToolViewProps } from './terminal-tool-view'

const noop = (): void => undefined

export const readyEmptyTerminalToolFixture = {
  status: 'ready',
  error: null,
  diagnostics: [],
  output: [],
  browserFallbackUrl: null,
  onCancelBrowserFallback: noop,
  onCopyBrowserFallback: noop,
  onNewTerminal: noop,
  onOpenBrowserFallback: noop,
  onOpenLink: noop,
  onRetry: noop
} satisfies TerminalToolViewProps

export const startingTerminalToolFixture = {
  ...readyEmptyTerminalToolFixture,
  status: 'starting'
} satisfies TerminalToolViewProps

export const sampleOutputTerminalToolFixture = {
  ...readyEmptyTerminalToolFixture,
  output: [
    { kind: 'command', content: 'git status --short' },
    { kind: 'output', content: ' M src/features/terminal/renderer/components/terminal-tool.tsx' },
    {
      kind: 'output',
      content: '?? src/features/terminal/renderer/components/terminal-tool-view.tsx'
    },
    { kind: 'command', content: 'pnpm exec vitest run terminal-tool-view.test.tsx' },
    { kind: 'output', content: '✓ 4 tests passed in 524ms' }
  ]
} satisfies TerminalToolViewProps

export const commandRunningTerminalToolFixture = {
  ...readyEmptyTerminalToolFixture,
  status: 'running',
  output: [
    { kind: 'command', content: 'pnpm storybook:build' },
    { kind: 'output', content: 'storybook v10.5.7' },
    { kind: 'output', content: 'building manager...' },
    { kind: 'output', content: 'building preview...' }
  ]
} satisfies TerminalToolViewProps

export const failedToStartTerminalToolFixture = {
  ...readyEmptyTerminalToolFixture,
  status: 'failed',
  error: 'Shell process exited before the Terminal was ready.'
} satisfies TerminalToolViewProps

export const unavailableTerminalToolFixture = {
  ...readyEmptyTerminalToolFixture,
  status: 'unavailable',
  error: 'No supported shell executable is available for this workspace.'
} satisfies TerminalToolViewProps

export const detectedBrowserLinkTerminalToolFixture = {
  ...readyEmptyTerminalToolFixture,
  output: [
    { kind: 'command', content: 'pnpm dev' },
    { kind: 'output', content: 'VITE ready in 412 ms' },
    { kind: 'output', content: 'Local:' },
    {
      kind: 'link',
      content: 'http://localhost:5173/',
      url: 'http://localhost:5173/'
    }
  ]
} satisfies TerminalToolViewProps
