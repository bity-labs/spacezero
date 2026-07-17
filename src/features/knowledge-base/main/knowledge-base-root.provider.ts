import type { Stats } from 'node:fs'
import { lstat, realpath } from 'node:fs/promises'
import { join } from 'node:path'

import type { KnowledgeBaseStatus } from '../shared'

export type KnowledgeBaseRootProvider = {
  getStatus: () => Promise<KnowledgeBaseStatus>
  getVerifiedRoot: () => Promise<string>
  invalidate: () => void
}

type VerifiedRoot = {
  configuredPath: string
  canonicalRoot: string
  rootIdentity: FileIdentity
  gitIdentity: FileIdentity
}

type FileIdentity = Pick<Stats, 'dev' | 'ino'>

export function createKnowledgeBaseRootProvider({
  getStatus
}: {
  getStatus: () => Promise<KnowledgeBaseStatus>
}): KnowledgeBaseRootProvider {
  let verifiedRoot: VerifiedRoot | undefined

  return {
    getStatus,
    invalidate() {
      verifiedRoot = undefined
    },
    async getVerifiedRoot() {
      if (verifiedRoot) {
        const cachedRoot = await readRootIdentity(verifiedRoot.configuredPath)
        if (
          cachedRoot &&
          sameIdentity(cachedRoot.rootIdentity, verifiedRoot.rootIdentity) &&
          sameIdentity(cachedRoot.gitIdentity, verifiedRoot.gitIdentity) &&
          cachedRoot.canonicalRoot === verifiedRoot.canonicalRoot
        ) {
          return verifiedRoot.canonicalRoot
        }
        verifiedRoot = undefined
      }

      const status = await getStatus()
      if (status.setupState === 'unconfigured') {
        throw new Error('Knowledge Base is not configured.')
      }
      if (status.setupState === 'unavailable') {
        throw new Error(`Knowledge Base is unavailable at ${status.rootPath}.`)
      }

      const root = await readRootIdentity(status.rootPath)
      if (!root) throw new Error(`Knowledge Base is unavailable at ${status.rootPath}.`)

      verifiedRoot = {
        configuredPath: status.rootPath,
        ...root
      }
      return root.canonicalRoot
    }
  }
}

async function readRootIdentity(
  rootPath: string
): Promise<Omit<VerifiedRoot, 'configuredPath'> | undefined> {
  try {
    const rootDetails = await lstat(rootPath)
    if (!rootDetails.isDirectory() || rootDetails.isSymbolicLink()) return undefined

    const [canonicalRoot, gitDetails] = await Promise.all([
      realpath(rootPath),
      lstat(join(rootPath, '.git'))
    ])
    return {
      canonicalRoot,
      rootIdentity: toIdentity(rootDetails),
      gitIdentity: toIdentity(gitDetails)
    }
  } catch {
    return undefined
  }
}

function toIdentity(details: Stats): FileIdentity {
  return { dev: details.dev, ino: details.ino }
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino
}
