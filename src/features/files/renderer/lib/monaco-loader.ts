import * as monaco from 'monaco-editor'

type MonacoInstance = typeof monaco

type MonacoLoaderConfig = {
  monaco?: MonacoInstance
}

type MonacoInitPromise = Promise<MonacoInstance> & {
  cancel: () => void
}

let monacoInstance: MonacoInstance = monaco

function config(options: MonacoLoaderConfig): void {
  if (options.monaco) monacoInstance = options.monaco
}

function init(): MonacoInitPromise {
  let canceled = false
  const promise = new Promise<MonacoInstance>((resolve, reject) => {
    queueMicrotask(() => {
      if (canceled) {
        reject({ type: 'cancelation' })
        return
      }
      resolve(monacoInstance)
    })
  }) as MonacoInitPromise
  promise.cancel = () => {
    canceled = true
  }
  return promise
}

function __getMonacoInstance(): MonacoInstance {
  return monacoInstance
}

export default { __getMonacoInstance, config, init }
