import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const editorMock = vi.hoisted(() =>
  vi.fn((_props: Record<string, unknown>) => <div data-testid="monaco-react-editor" />)
)

vi.mock('@monaco-editor/react', () => ({
  default: editorMock
}))

vi.mock('../lib/monaco-environment', () => ({
  configureFilesMonacoEnvironment: vi.fn()
}))

import { configureFilesMonacoEnvironment } from '../lib/monaco-environment'
import { FilesMonacoEditor } from './files-monaco-editor'

describe('FilesMonacoEditor', () => {
  it('renders through the Monaco React adapter with bundled model lifecycle settings', () => {
    const onChange = vi.fn()
    const onMount = vi.fn()
    const options = { minimap: { enabled: false } }

    render(
      <FilesMonacoEditor
        height="100%"
        language="cpp"
        options={options}
        path="spacezero-files://session-1/native/main.cpp"
        theme="vs-dark"
        value={'int main() { return 0; }\n'}
        onChange={onChange}
        onMount={onMount}
      />
    )

    expect(configureFilesMonacoEnvironment).toHaveBeenCalledTimes(1)
    expect(editorMock).toHaveBeenCalledTimes(1)
    const editorProps = editorMock.mock.calls[0]?.[0]
    expect(editorProps?.className).toBe('size-full')
    expect(editorProps?.height).toBe('100%')
    expect(editorProps?.keepCurrentModel).toBe(false)
    expect(editorProps?.language).toBe('cpp')
    expect(editorProps?.loading).toBeNull()
    expect(editorProps?.options).toEqual({ automaticLayout: true, minimap: { enabled: false } })
    expect(editorProps?.path).toBe('spacezero-files://session-1/native/main.cpp')
    expect(editorProps?.theme).toBe('vs-dark')
    expect(editorProps?.value).toBe('int main() { return 0; }\n')
    expect(editorProps?.onChange).toBe(onChange)
    expect(editorProps?.onMount).toBe(onMount)
  })
})
