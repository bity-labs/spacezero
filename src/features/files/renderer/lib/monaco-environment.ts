import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import CssWorker from 'monaco-editor/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/language/html/html.worker?worker'
import JsonWorker from 'monaco-editor/language/json/json.worker?worker'
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'

type MonacoWorkerLabel =
  'css' | 'less' | 'scss' | 'handlebars' | 'html' | 'json' | 'javascript' | 'typescript'

type MonacoEnvironmentHost = typeof globalThis & {
  MonacoEnvironment?: {
    getWorker: (_workerId: string, label: string) => Worker
  }
}

let configured = false

export function configureFilesMonacoEnvironment(): void {
  if (configured) return
  configured = true

  ;(globalThis as MonacoEnvironmentHost).MonacoEnvironment = {
    getWorker: (_workerId: string, label: string): Worker => createMonacoWorker(label)
  }
  loader.config({ monaco })
  monaco.editor.setTheme('vs-dark')
}

function createMonacoWorker(label: string): Worker {
  const workerLabel = label as MonacoWorkerLabel
  if (workerLabel === 'json') return new JsonWorker()
  if (workerLabel === 'css' || workerLabel === 'scss' || workerLabel === 'less')
    return new CssWorker()
  if (workerLabel === 'html' || workerLabel === 'handlebars') return new HtmlWorker()
  if (workerLabel === 'typescript' || workerLabel === 'javascript') return new TsWorker()
  return new EditorWorker()
}
