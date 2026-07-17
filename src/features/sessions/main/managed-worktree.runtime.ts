import { getSpaceZeroWorktreesPath } from '../../settings/main'
import { createManagedWorktreeAdapter } from './managed-worktree.adapter'
import { createManagedWorktreeService } from './managed-worktree.service'

let service: ReturnType<typeof createManagedWorktreeService> | undefined

export function getManagedWorktreeService(): ReturnType<typeof createManagedWorktreeService> {
  service ??= createManagedWorktreeService({
    adapter: createManagedWorktreeAdapter(),
    getWorktreesPath: getSpaceZeroWorktreesPath
  })
  return service
}
