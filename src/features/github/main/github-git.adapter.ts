import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import type { GitHubRemoteAdapter } from './github-projects.service'

const execFileAsync = promisify(execFile)

type RunGit = (
  file: string,
  args: string[],
  options: { encoding: 'utf8'; maxBuffer: number }
) => Promise<{ stdout: string }>

export function createGitHubRemoteAdapter({
  runGit = execFileAsync as RunGit
}: {
  runGit?: RunGit
} = {}): GitHubRemoteAdapter {
  return {
    async listRemotes(projectPath) {
      try {
        const { stdout } = await runGit(
          'git',
          ['-C', projectPath, 'config', '--get-regexp', '^remote\\..*\\.url$'],
          { encoding: 'utf8', maxBuffer: 1024 * 1024 }
        )
        return stdout
          .split('\n')
          .map((line) => line.trim().split(/\s+/, 2)[1])
          .filter((url): url is string => Boolean(url))
      } catch (error) {
        if (isExitCode(error, 1)) return []
        throw createGitRemoteInspectionError()
      }
    }
  }
}

function createGitRemoteInspectionError(): Error {
  return new Error('github.gitRemoteInspectionFailed')
}

function isExitCode(error: unknown, code: number): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    Number((error as { code?: unknown }).code) === code
  )
}
