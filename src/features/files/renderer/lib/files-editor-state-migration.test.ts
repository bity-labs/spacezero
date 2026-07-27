import { describe, expect, it, vi } from 'vitest'

import {
  migrateFilesMonacoEditorState,
  registerFilesMonacoEditor
} from './files-editor-state-migration'
import { createFilesMonacoModelPath } from './files-editor-model'

class FakeUri {
  constructor(private readonly value: string) {}
  toString(): string {
    return this.value
  }
}

class FakeModel {
  readonly uri: FakeUri
  disposed = false

  constructor(
    uri: FakeUri,
    private readonly value: string,
    private readonly language: string
  ) {
    this.uri = uri
  }

  getValue(): string {
    return this.value
  }

  getLanguageId(): string {
    return this.language
  }

  dispose(): void {
    this.disposed = true
  }
}

describe('Files Monaco editor state migration', () => {
  it('moves model identity, preserves buffer/view state, and disposes the old model', () => {
    const models = new Map<string, FakeModel>()
    const monaco = {
      Uri: { parse: (value: string) => new FakeUri(value) },
      editor: {
        getModel: (uri: FakeUri) => models.get(uri.toString()) ?? null,
        createModel: (value: string, language: string, uri: FakeUri) => {
          const model = new FakeModel(uri, value, language)
          models.set(uri.toString(), model)
          return model
        }
      }
    }
    const oldPath = createFilesMonacoModelPath('session-1', 'src/old/app.ts')
    const oldModel = monaco.editor.createModel('const value = 1\n', 'typescript', monaco.Uri.parse(oldPath))
    const viewState = { cursorState: [], viewState: {} }
    const editor = {
      getModel: vi.fn(() => oldModel),
      saveViewState: vi.fn(() => viewState),
      restoreViewState: vi.fn()
    }

    const unregister = registerFilesMonacoEditor(oldPath, editor as never, monaco as never)
    migrateFilesMonacoEditorState('session-1', 'src/old', 'src/new')
    unregister()

    const newPath = createFilesMonacoModelPath('session-1', 'src/new/app.ts')
    const newModel = models.get(newPath)
    expect(newModel?.getValue()).toBe('const value = 1\n')
    expect(newModel?.getLanguageId()).toBe('typescript')
    expect(oldModel.disposed).toBe(true)
    expect(editor.saveViewState).toHaveBeenCalledTimes(1)

    registerFilesMonacoEditor(newPath, editor as never, monaco as never)
    expect(editor.restoreViewState).toHaveBeenCalledWith(viewState)
  })
})
