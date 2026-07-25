import { getManagedWorktreeService } from '../../sessions/main/managed-worktree.runtime'
import { createSessionsRepository } from '../../sessions/main/sessions.repository'
import { createGitService } from './git.service'

let service: ReturnType<typeof createGitService> | undefined

export function getGitService(): ReturnType<typeof createGitService> {
  service ??= createGitService({
    sessionsRepository: createSessionsRepository(),
    managedWorktreeService: getManagedWorktreeService()
  })
  return service
}
