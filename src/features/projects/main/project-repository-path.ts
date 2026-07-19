import { execFileSync } from 'node:child_process'
import { existsSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'

export function resolveProjectRepositoryPath(path: string): string {
  const trimmedPath = path.trim()
  if (!trimmedPath) throw new Error('Project path is required')
  if (!isAbsolute(trimmedPath)) throw new Error('Project path must be absolute')

  const normalized = resolve(trimmedPath)
  if (!existsSync(normalized)) throw new Error('Project path does not exist')
  if (!statSync(normalized).isDirectory()) throw new Error('Project path must be a directory')

  let repositoryRoot: string
  try {
    const insideWorktree = runGit(normalized, ['rev-parse', '--is-inside-work-tree'])
    if (insideWorktree !== 'true') throw new Error('not a worktree')
    repositoryRoot = runGit(normalized, ['rev-parse', '--show-toplevel'])
    if (!repositoryRoot) throw new Error('missing repository root')
  } catch {
    throw new Error('project.notGitRepository')
  }

  try {
    runGit(repositoryRoot, ['rev-parse', '--verify', 'HEAD^{commit}'])
  } catch {
    throw new Error('project.repositoryHasNoCommits')
  }

  return realpathSync(repositoryRoot)
}

function runGit(path: string, args: string[]): string {
  return execFileSync('git', ['-C', path, ...args], {
    encoding: 'utf8',
    env: withoutInheritedGitEnvironment(),
    stdio: ['ignore', 'pipe', 'ignore']
  }).trim()
}

function withoutInheritedGitEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_'))
  )
}
