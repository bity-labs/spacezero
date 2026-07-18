import { spawn } from 'node:child_process'
import { chmod, lstat, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

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

      await mkdir(dirname(destination), { recursive: true })
      const partialDestination = `${destination}.spacezero-partial`
      await rm(partialDestination, { recursive: true, force: true })

      const askPassDirectory = await mkdtemp(join(tmpdir(), 'spacezero-git-askpass-'))
      const askPassPath = join(
        askPassDirectory,
        process.platform === 'win32' ? 'askpass.cmd' : 'askpass.sh'
      )
      await writeFile(askPassPath, createAskPassScript(), { mode: 0o700, flag: 'wx' })
      await chmod(askPassPath, 0o700)

      try {
        await runGit({
          args: [
            '-c',
            'credential.helper=',
            'clone',
            '--progress',
            '--',
            repository.cloneUrl,
            partialDestination
          ],
          environment: {
            ...process.env,
            GIT_ASKPASS: askPassPath,
            GIT_TERMINAL_PROMPT: '0',
            SPACEZERO_GITHUB_TOKEN: accessToken
          },
          signal,
          onProgress: (percent) => onProgress({ percent })
        })
        const remote = await runGit({
          args: ['-C', partialDestination, 'remote', 'get-url', 'origin'],
          signal
        })
        if (remote.stdout.trim() !== repository.cloneUrl) {
          throw new Error('github.cloneRemoteMismatch')
        }
        if (await pathExists(destination)) throw new Error('github.cloneDestinationExists')
        await rename(partialDestination, destination)
      } catch (error) {
        await rm(partialDestination, { recursive: true, force: true }).catch(() => undefined)
        if (signal.aborted || error instanceof GitHubCloneCancelledError) {
          throw new GitHubCloneCancelledError()
        }
        throw createSanitizedCloneError()
      } finally {
        await rm(askPassDirectory, { recursive: true, force: true }).catch(() => undefined)
      }
    },

    async removeDestination(destination) {
      await rm(destination, { recursive: true, force: true })
    }
  }
}

function createAskPassScript(): string {
  if (process.platform === 'win32') {
    return '@echo off\r\necho %* | findstr /I "Username" >nul\r\nif %errorlevel%==0 (echo x-access-token) else (echo %SPACEZERO_GITHUB_TOKEN%)\r\n'
  }
  return '#!/bin/sh\ncase "$1" in\n  *Username*) printf "%s\\n" "x-access-token" ;;\n  *) printf "%s\\n" "$SPACEZERO_GITHUB_TOKEN" ;;\nesac\n'
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
