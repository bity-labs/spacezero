export type ProjectLifecycleLock = <T>(projectId: string, operation: () => Promise<T>) => Promise<T>

const pendingOperations = new Map<string, Promise<void>>()

export const withProjectLifecycleLock: ProjectLifecycleLock = async (projectId, operation) => {
  const key = projectId.trim()
  const previous = pendingOperations.get(key) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  const queued = previous.catch(() => undefined).then(() => current)
  pendingOperations.set(key, queued)

  await previous.catch(() => undefined)
  try {
    return await operation()
  } finally {
    release()
    if (pendingOperations.get(key) === queued) pendingOperations.delete(key)
  }
}
