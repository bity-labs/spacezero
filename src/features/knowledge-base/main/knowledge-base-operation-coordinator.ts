export type KnowledgeBaseOperationCoordinator = {
  runExclusive: <T>(operation: () => Promise<T>) => Promise<T>
}

export function createKnowledgeBaseOperationCoordinator(): KnowledgeBaseOperationCoordinator {
  let pending: Promise<void> = Promise.resolve()

  return {
    runExclusive<T>(operation: () => Promise<T>): Promise<T> {
      const result = pending.then(operation, operation)
      pending = result.then(
        () => undefined,
        () => undefined
      )
      return result
    }
  }
}
