import { isAbsolute } from 'node:path'

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
    gitUrl: z.string().trim().min(1).max(2048)
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

  async function stageFiles(input: z.infer<typeof knowledgeBaseGitPathListSchema>) {
    return operations.runExclusive(() =>
      withRoot(async (rootPath) => {
        await host.runGit(rootPath, ['add', '--', ...input.relativePaths])
        return { stagedPaths: input.relativePaths }
      })
    )
  }

  async function unstageFiles(input: z.infer<typeof knowledgeBaseGitPathListSchema>) {
    return operations.runExclusive(() =>
      withRoot(async (rootPath) => {
        await host.runGit(rootPath, ['restore', '--staged', '--', ...input.relativePaths])
        return { unstagedPaths: input.relativePaths }
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

  async function configureOrigin(input: z.infer<typeof knowledgeBaseGitOriginSchema>) {
    return operations.runExclusive(() =>
      withRoot(async (rootPath) => {
        const existing = await getOrigin(host, rootPath)
        await host.runGit(rootPath, existing ? ['remote', 'set-url', 'origin', input.gitUrl] : ['remote', 'add', 'origin', input.gitUrl])
        const origin = (await getOrigin(host, rootPath)) ?? input.gitUrl
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
