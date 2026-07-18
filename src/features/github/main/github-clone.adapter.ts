import { spawn } from 'node:child_process'
import { lstat, mkdir, mkdtemp, rename, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import { withGitHubGitAuthentication } from '../../../main/lib/github-git-authentication'
import type { GitHubCloneAdapter } from './github-repository-setup.service'
import { GitHubCloneCancelledError } from './github-repository-setup.service'

export type GitProcessRequest = {
  args: string[]
  environment?: NodeJS.ProcessEnv
  signal?: AbortSignal
  onProgress?: (percent: number) => void
}

export type RunGitProcess = (request: GitProcessRequest) => Promise<{ stdout: string }>

export function createGitHubCloneAdapter({
  runGit = runGitProcess
}: {
  runGit?: RunGitProcess
} = {}): GitHubCloneAdapter {
  return {
    async clone({ repository, destination, accessToken, signal, onProgress }) {
      assertTokenFreeCloneUrl(repository.cloneUrl)
      if (await pathExists(destination)) throw new Error('github.cloneDestinationExists')

      const destinationParent = dirname(destination)
      await mkdir(destinationParent, { recursive: true })
      const partialDestination = await mkdtemp(
        join(destinationParent, `.${basename(destination)}.spacezero-partial-`)
      )

      try {
        await withGitHubGitAuthentication(accessToken, async (authentication) => {
          await runGit({
            args: [
              ...authentication.configArgs,
              'clone',
              '--no-checkout',
              '--no-recurse-submodules',
              `--template=${authentication.templateDirectory}`,
              '--progress',
              '--',
              repository.cloneUrl,
              partialDestination
            ],
            environment: authentication.authenticatedEnvironment,
            signal,
            onProgress: (percent) => onProgress({ percent })
          })
          const remote = await runGit({
            args: [
              ...authentication.configArgs,
              '-C',
              partialDestination,
              'remote',
              'get-url',
              'origin'
            ],
            environment: authentication.isolatedEnvironment,
            signal
          })
          if (remote.stdout.trim() !== repository.cloneUrl) {
            throw new Error('github.cloneRemoteMismatch')
          }
        })

        // Materialize project files only after the credential has left the child environment.
        await runGit({
          args: ['-C', partialDestination, 'reset', '--hard', 'HEAD'],
          signal
        })
        if (await pathExists(destination)) throw new Error('github.cloneDestinationExists')
        await rename(partialDestination, destination)
      } catch (error) {
        await rm(partialDestination, { recursive: true, force: true }).catch(() => undefined)
        if (signal.aborted || error instanceof GitHubCloneCancelledError) {
          throw new GitHubCloneCancelledError()
        }
        throw createSanitizedCloneError()
      }
    },

    async removeDestination(destination) {
      await rm(destination, { recursive: true, force: true })
    }
  }
}

function assertTokenFreeCloneUrl(url: string): void {
  try {
    const parsed = new URL(url)
    // URL normalizes an explicit default :443 port away, so also require the raw canonical origin.
    if (
      parsed.protocol !== 'https:' ||
      parsed.hostname !== 'github.com' ||
      parsed.port ||
      !url.startsWith('https://github.com/') ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error()
    }
  } catch {
    throw new Error('github.invalidCloneUrl')
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (isMissing(error)) return false
    throw error
  }
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}

function createSanitizedCloneError(): Error {
  return new Error('github.cloneFailed')
}

async function runGitProcess({
  args,
  environment,
  signal,
  onProgress
}: GitProcessRequest): Promise<{ stdout: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })
    let stdout = ''
    let settled = false

    const abort = (): void => {
      if (settled) return
      child.kill('SIGTERM')
    }
    signal?.addEventListener('abort', abort, { once: true })

    child.stdout.on('data', (chunk: Buffer) => {
      if (stdout.length < 1024 * 1024) stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      for (const match of text.matchAll(/(\d{1,3})%/g)) {
        const percent = Number(match[1])
        if (percent >= 0 && percent <= 100) onProgress?.(percent)
      }
    })
    child.once('error', () => {
      settled = true
      signal?.removeEventListener('abort', abort)
      reject(createSanitizedCloneError())
    })
    child.once('close', (code) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', abort)
      if (signal?.aborted) {
        reject(new GitHubCloneCancelledError())
      } else if (code === 0) {
        resolve({ stdout })
      } else {
        reject(createSanitizedCloneError())
      }
    })
  })
}
