import { stat } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'

import { z } from 'zod'

import {
  redactGitSecrets,
  sanitizeGitRemoteUrl,
  toRedactedGitError
} from './knowledge-base-git-security'
import type { KnowledgeBaseOperationCoordinator } from './knowledge-base-operation-coordinator'
import type { KnowledgeBaseRootProvider } from './knowledge-base-root.provider'
import type { KnowledgeBaseGitHost } from './knowledge-base-sync.service'

const knowledgeBaseGitPathSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine((value) => !isAbsolute(value), 'Path must be Knowledge Base-relative.')
  .refine(
    (value) =>
      !value
        .split(/[\\/]+/)
        .filter(Boolean)
        .includes('..'),
    'Path must stay inside the Knowledge Base repository.'
  )
  .refine(
    (value) => value !== '.git' && !value.startsWith('.git/') && !value.startsWith('.git\\'),
    'Git internals are not valid Knowledge Base paths.'
  )

export const knowledgeBaseGitPathListSchema = z
  .object({
    relativePaths: z.array(knowledgeBaseGitPathSchema).min(1).max(200)
  })
  .strict()

export const knowledgeBaseGitCommitSchema = z
  .object({
    message: z.string().trim().min(1).max(10_000)
  })
  .strict()

export const knowledgeBaseGitOriginSchema = z
  .object({
    gitUrl: z
      .string()
      .trim()
      .min(1)
      .max(2048)
      .transform((value, ctx) => {
        const normalized = normalizeSupportedGitRemoteUrl(value)
        if (!normalized) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              'Origin must be an HTTPS or SSH Git remote URL without credentials, query parameters, or fragments.'
          })
          return z.NEVER
        }
        return normalized
      })
  })
  .strict()

export const knowledgeBaseGitPushSchema = z.object({}).strict()

export type KnowledgeBaseGitAgentService = ReturnType<typeof createKnowledgeBaseGitAgentService>

export function createKnowledgeBaseGitAgentService({
  rootProvider,
  host,
  operations
}: {
  rootProvider: Pick<KnowledgeBaseRootProvider, 'getVerifiedRoot'>
  host: Pick<KnowledgeBaseGitHost, 'runGit'>
  operations: KnowledgeBaseOperationCoordinator
}) {
  async function withRoot<T>(operation: (rootPath: string) => Promise<T>): Promise<T> {
    const rootPath = await rootProvider.getVerifiedRoot()
    try {
      return await operation(rootPath)
    } catch (error) {
      throw toRedactedGitError(error)
    }
  }

  async function inspectRepository() {
    return withRoot(async (rootPath) => {
      const [branch, status, origin] = await Promise.all([
        getCurrentBranch(host, rootPath),
        host.runGit(rootPath, [
          'status',
          '--porcelain=v1',
          '--branch',
          '--untracked-files=all'
        ]),
        getOrigin(host, rootPath)
      ])
      return {
        branch,
        origin: origin ? { configured: true as const, url: sanitizeGitRemoteUrl(origin) } : { configured: false as const },
        porcelainStatus: redactGitSecrets(status.stdout).trim()
      }
    })
  }

  async function stageFiles(input: z.input<typeof knowledgeBaseGitPathListSchema>) {
    const validated = knowledgeBaseGitPathListSchema.parse(input)
    return operations.runExclusive(() =>
      withRoot(async (rootPath) => {
        await assertWholeFilePaths(rootPath, validated.relativePaths, host)
        await host.runGit(rootPath, ['--literal-pathspecs', 'add', '--', ...validated.relativePaths])
        return { stagedPaths: validated.relativePaths }
      })
    )
  }

  async function unstageFiles(input: z.input<typeof knowledgeBaseGitPathListSchema>) {
    const validated = knowledgeBaseGitPathListSchema.parse(input)
    return operations.runExclusive(() =>
      withRoot(async (rootPath) => {
        await assertWholeFilePaths(rootPath, validated.relativePaths, host)
        await host.runGit(rootPath, [
          '--literal-pathspecs',
          'restore',
          '--staged',
          '--',
          ...validated.relativePaths
        ])
        return { unstagedPaths: validated.relativePaths }
      })
    )
  }

  async function createCommit(input: z.infer<typeof knowledgeBaseGitCommitSchema>) {
    return operations.runExclusive(() =>
      withRoot(async (rootPath) => {
        const result = await host.runGit(rootPath, ['commit', '-m', input.message])
        return { output: redactGitSecrets(result.stdout || result.stderr).trim() }
      })
    )
  }

  async function getOriginRemote() {
    return withRoot(async (rootPath) => {
      const origin = await getOrigin(host, rootPath)
      return origin ? { configured: true as const, url: sanitizeGitRemoteUrl(origin) } : { configured: false as const }
    })
  }

  async function configureOrigin(input: z.input<typeof knowledgeBaseGitOriginSchema>) {
    const validated = knowledgeBaseGitOriginSchema.parse(input)
    return operations.runExclusive(() =>
      withRoot(async (rootPath) => {
        const existing = await getOrigin(host, rootPath)
        await host.runGit(
          rootPath,
          existing
            ? ['remote', 'set-url', 'origin', validated.gitUrl]
            : ['remote', 'add', 'origin', validated.gitUrl]
        )
        const origin = (await getOrigin(host, rootPath)) ?? validated.gitUrl
        return { configured: true as const, url: sanitizeGitRemoteUrl(origin) }
      })
    )
  }

  async function push() {
    return operations.runExclusive(() =>
      withRoot(async (rootPath) => {
        const origin = await getOrigin(host, rootPath)
        if (!origin) throw new Error('Knowledge Base origin remote is not configured.')
        const branch = await getCurrentBranch(host, rootPath)
        if (!branch) throw new Error('Knowledge Base push requires an active branch.')
        const result = await host.runGit(rootPath, ['push', '--set-upstream', 'origin', branch])
        return {
          branch,
          origin: sanitizeGitRemoteUrl(origin),
          output: redactGitSecrets(result.stdout || result.stderr).trim()
        }
      })
    )
  }

  return { inspectRepository, stageFiles, unstageFiles, createCommit, getOriginRemote, configureOrigin, push }
}

async function assertWholeFilePaths(
  rootPath: string,
  relativePaths: readonly string[],
  host: Pick<KnowledgeBaseGitHost, 'runGit'>
): Promise<void> {
  await Promise.all(
    relativePaths.map(async (relativePath) => {
      try {
        const entry = await stat(join(rootPath, relativePath))
        if (entry.isDirectory()) {
          throw new Error(`Knowledge Base Git path must name a whole file: ${relativePath}`)
        }
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
          throw error
        }

        const indexPaths = (await host.runGit(rootPath, [
          '--literal-pathspecs',
          'ls-files',
          '-z',
          '--',
          relativePath
        ])).stdout
          .split('\0')
          .filter(Boolean)
        const headPaths = (await host.runGit(rootPath, [
          '--literal-pathspecs',
          'ls-tree',
          '-r',
          '--name-only',
          '-z',
          'HEAD',
          '--',
          relativePath
        ])).stdout
          .split('\0')
          .filter(Boolean)
        const trackedPaths = [...new Set([...indexPaths, ...headPaths])]
        if (trackedPaths.length !== 1 || trackedPaths[0] !== relativePath.replaceAll('\\', '/')) {
          throw new Error(`Knowledge Base Git path must name a whole file: ${relativePath}`, {
            cause: error
          })
        }
      }
    })
  )
}

function normalizeSupportedGitRemoteUrl(remoteUrl: string): string | null {
  if (remoteUrl.includes('\0') || remoteUrl.includes('::')) return null

  try {
    const url = new URL(remoteUrl)
    if (url.protocol !== 'https:' && url.protocol !== 'ssh:') return null
    if (!url.hostname || url.search || url.hash) return null
    if (url.protocol === 'https:' && (url.username || url.password)) return null
    if (url.protocol === 'ssh:' && url.password) return null
    return remoteUrl
  } catch {
    if (/[?#\s]/.test(remoteUrl)) return null
    if (remoteUrl.startsWith('/') || remoteUrl.startsWith('./') || remoteUrl.startsWith('../')) {
      return null
    }
    const scpStyle = /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[^:]+$/.exec(remoteUrl)
    return scpStyle ? remoteUrl : null
  }
}

async function getOrigin(
  host: Pick<KnowledgeBaseGitHost, 'runGit'>,
  rootPath: string
): Promise<string | undefined> {
  const remotes = (await host.runGit(rootPath, ['remote'])).stdout
    .split(/\r?\n/)
    .map((remote) => remote.trim())
  if (!remotes.includes('origin')) return undefined
  const url = (await host.runGit(rootPath, ['remote', 'get-url', 'origin'])).stdout.trim()
  return url || undefined
}

async function getCurrentBranch(
  host: Pick<KnowledgeBaseGitHost, 'runGit'>,
  rootPath: string
): Promise<string> {
  return (await host.runGit(rootPath, ['branch', '--show-current'])).stdout.trim()
}
