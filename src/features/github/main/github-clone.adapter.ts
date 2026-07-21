import { spawn } from 'node:child_process'
import type { Stats } from 'node:fs'
import { lstat, mkdir, mkdtemp, realpath, rename, rm } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'

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
  const completedDestinations = new Map<string, { canonicalPath: string; identity: FileIdentity }>()

  return {
    async clone({ repository, managedRoot, destination, accessToken, signal, onProgress }) {
      assertTokenFreeCloneUrl(repository.cloneUrl)
      assertCloneActive(signal)

      let partialDestination: string | undefined
      let partialIdentity: FileIdentity | undefined
      let finalDestination: string | undefined
      let finalIdentity: FileIdentity | undefined

      try {
        const paths = await prepareManagedClonePaths(managedRoot, destination)
        assertCloneActive(signal)
        partialDestination = await mkdtemp(
          join(paths.canonicalRoot, `.${basename(destination)}.spacezero-partial-`)
        )
        partialIdentity = await readDirectoryIdentity(partialDestination)
        await verifyManagedRoot(paths)
        if (!(await isCanonicalChild(paths.canonicalRoot, partialDestination))) {
          throw new Error('github.cloneDestinationOutsideProjectsPath')
        }
        assertCloneActive(signal)

        await withGitHubGitAuthentication(accessToken, async (authentication) => {
          assertCloneActive(signal)
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
              partialDestination!
            ],
            environment: authentication.authenticatedEnvironment,
            signal,
            onProgress: (percent) => onProgress({ percent })
          })
          assertCloneActive(signal)
          const remote = await runGit({
            args: [
              ...authentication.configArgs,
              '-C',
              partialDestination!,
              'remote',
              'get-url',
              'origin'
            ],
            environment: authentication.isolatedEnvironment,
            signal
          })
          assertCloneActive(signal)
          if (remote.stdout.trim() !== repository.cloneUrl) {
            throw new Error('github.cloneRemoteMismatch')
          }
        })

        // Materialize project files only after the credential has left the child environment.
        await runGit({
          args: ['-C', partialDestination, 'reset', '--hard', 'HEAD'],
          signal
        })
        assertCloneActive(signal)
        await assertDirectoryIdentity(partialDestination, partialIdentity)
        const parentIdentity = await verifyManagedParent(paths)
        if (await pathExists(paths.canonicalDestination)) {
          throw new Error('github.cloneDestinationExists')
        }

        await rename(partialDestination, paths.canonicalDestination)
        finalDestination = paths.canonicalDestination
        finalIdentity = partialIdentity
        partialDestination = undefined
        await verifyManagedParent(paths, parentIdentity)
        finalIdentity = await assertDirectoryIdentity(finalDestination, partialIdentity)
        if (!(await isCanonicalChild(paths.canonicalRoot, finalDestination))) {
          throw new Error('github.cloneDestinationOutsideProjectsPath')
        }
        completedDestinations.set(destinationKey(destination), {
          canonicalPath: finalDestination,
          identity: finalIdentity
        })
      } catch (error) {
        if (partialDestination && partialIdentity) {
          await removeOwnedDirectory(partialDestination, partialIdentity).catch(() => undefined)
        }
        if (finalDestination && finalIdentity) {
          await removeOwnedDirectory(finalDestination, finalIdentity).catch(() => undefined)
        }
        if (signal.aborted || error instanceof GitHubCloneCancelledError) {
          throw new GitHubCloneCancelledError()
        }
        if (error instanceof Error && error.message === 'github.cloneDestinationExists') {
          throw error
        }
        throw createSanitizedCloneError()
      }
    },

    async removeDestination(destination) {
      const owned = completedDestinations.get(destinationKey(destination))
      if (!owned) throw new Error('github.cloneDestinationNotOwned')
      await removeOwnedDirectory(owned.canonicalPath, owned.identity)
      completedDestinations.delete(destinationKey(destination))
    },

    releaseDestination(destination) {
      completedDestinations.delete(destinationKey(destination))
    }
  }
}

type FileIdentity = Pick<Stats, 'dev' | 'ino'>

type ManagedClonePaths = {
  canonicalRoot: string
  rootIdentity: FileIdentity
  canonicalParent: string
  canonicalDestination: string
}

async function prepareManagedClonePaths(
  managedRoot: string,
  destination: string
): Promise<ManagedClonePaths> {
  const lexicalRoot = resolve(managedRoot)
  const lexicalDestination = resolve(destination)
  const relativeDestination = relative(lexicalRoot, lexicalDestination)
  const segments = relativeDestination.split(sep)
  if (
    relativeDestination === '' ||
    relativeDestination === '..' ||
    relativeDestination.startsWith(`..${sep}`) ||
    isAbsolute(relativeDestination) ||
    segments.length !== 2 ||
    segments.some((segment) => !segment)
  ) {
    throw new Error('github.cloneDestinationOutsideProjectsPath')
  }

  await mkdir(lexicalRoot, { recursive: true })
  const canonicalRoot = await realpath(lexicalRoot)
  const rootIdentity = await readDirectoryIdentity(canonicalRoot)
  const canonicalParent = join(canonicalRoot, segments[0])
  const canonicalDestination = join(canonicalParent, segments[1])
  await mkdir(canonicalParent).catch((error: unknown) => {
    if (!isAlreadyExists(error)) throw error
  })

  const paths = { canonicalRoot, rootIdentity, canonicalParent, canonicalDestination }
  await verifyManagedParent(paths)
  if (await pathExists(canonicalDestination)) {
    throw new Error('github.cloneDestinationExists')
  }
  return paths
}

async function verifyManagedRoot(paths: ManagedClonePaths): Promise<void> {
  await assertDirectoryIdentity(paths.canonicalRoot, paths.rootIdentity)
  if (!samePath(await realpath(paths.canonicalRoot), paths.canonicalRoot)) {
    throw new Error('github.cloneDestinationOutsideProjectsPath')
  }
}

async function verifyManagedParent(
  paths: ManagedClonePaths,
  expectedIdentity?: FileIdentity
): Promise<FileIdentity> {
  await verifyManagedRoot(paths)
  const identity = await readDirectoryIdentity(paths.canonicalParent)
  if (expectedIdentity && !sameIdentity(identity, expectedIdentity)) {
    throw new Error('github.cloneDestinationOutsideProjectsPath')
  }
  const canonicalParent = await realpath(paths.canonicalParent)
  if (!samePath(canonicalParent, paths.canonicalParent)) {
    throw new Error('github.cloneDestinationOutsideProjectsPath')
  }
  if (!(await isCanonicalChild(paths.canonicalRoot, canonicalParent))) {
    throw new Error('github.cloneDestinationOutsideProjectsPath')
  }
  return identity
}

async function readDirectoryIdentity(path: string): Promise<FileIdentity> {
  const stats = await lstat(path)
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error('github.cloneDestinationOutsideProjectsPath')
  }
  return { dev: stats.dev, ino: stats.ino }
}

async function assertDirectoryIdentity(
  path: string,
  expected: FileIdentity
): Promise<FileIdentity> {
  const identity = await readDirectoryIdentity(path)
  if (!sameIdentity(identity, expected)) {
    throw new Error('github.cloneDestinationOutsideProjectsPath')
  }
  return identity
}

async function removeOwnedDirectory(path: string, identity: FileIdentity): Promise<void> {
  await assertDirectoryIdentity(path, identity)
  await rm(path, { recursive: true, force: true })
}

async function isCanonicalChild(root: string, candidate: string): Promise<boolean> {
  const canonicalCandidate = await realpath(candidate)
  const relativePath = relative(root, canonicalCandidate)
  return (
    relativePath !== '' &&
    relativePath !== '..' &&
    !relativePath.startsWith(`..${sep}`) &&
    !isAbsolute(relativePath)
  )
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

function samePath(left: string, right: string): boolean {
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
}

function destinationKey(destination: string): string {
  const path = resolve(destination)
  return process.platform === 'win32' ? path.toLowerCase() : path
}

function assertCloneActive(signal: AbortSignal): void {
  if (signal.aborted) throw new GitHubCloneCancelledError()
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
  return hasErrorCode(error, 'ENOENT')
}

function isAlreadyExists(error: unknown): boolean {
  return hasErrorCode(error, 'EEXIST')
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
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
  if (signal?.aborted) throw new GitHubCloneCancelledError()

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
