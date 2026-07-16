import type { KnowledgeBaseService } from './knowledge-base.service'
import type { KnowledgeBaseSyncService } from './knowledge-base-sync.service'

export type KnowledgeBaseRecoveryService = {
  openFolder: () => Promise<void>
  openRemote: () => Promise<void>
}

export function createKnowledgeBaseRecoveryService({
  service,
  openPath,
  openExternal
}: {
  service: Pick<KnowledgeBaseService, 'getStatus'> & Pick<KnowledgeBaseSyncService, 'getSyncStatus'>
  openPath: (path: string) => Promise<string>
  openExternal: (url: string) => Promise<void>
}): KnowledgeBaseRecoveryService {
  return {
    async openFolder() {
      const status = await service.getStatus()
      if (status.setupState !== 'configured') throw new Error('Knowledge Base is not configured.')
      const error = await openPath(status.rootPath)
      if (error) throw new Error(error)
    },

    async openRemote() {
      const status = await service.getSyncStatus()
      if (status.remoteState !== 'configured' || !status.remoteUrl) {
        throw new Error('Knowledge Base origin remote is not configured.')
      }
      const url = toExternalGitRemoteUrl(status.remoteUrl)
      if (!url) throw new Error('This Git remote cannot be opened in a browser.')
      await openExternal(url)
    }
  }
}

export function toExternalGitRemoteUrl(remoteUrl: string): string | undefined {
  const trimmedUrl = remoteUrl.trim()
  const scpStyle = /^(?:[^@/]+@)?([^:/]+):(.+)$/.exec(trimmedUrl)
  if (scpStyle && !trimmedUrl.includes('://')) {
    return `https://${scpStyle[1]}/${stripGitSuffix(scpStyle[2])}`
  }

  try {
    const url = new URL(trimmedUrl)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return `${url.protocol}//${url.host}/${stripGitSuffix(url.pathname.replace(/^\//, ''))}`
    }
    if (url.protocol === 'ssh:' && url.hostname) {
      return `https://${url.hostname}/${stripGitSuffix(url.pathname.replace(/^\//, ''))}`
    }
  } catch {
    return undefined
  }
  return undefined
}

function stripGitSuffix(path: string): string {
  return path.replace(/\.git\/?$/, '').replace(/\/$/, '')
}
