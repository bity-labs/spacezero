export type CanonicalGitHubRemote = {
  owner: string
  repository: string
  key: string
}

export function canonicalizeGitHubRemote(remote: string): CanonicalGitHubRemote | null {
  const value = remote.trim()
  const scpMatch = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i.exec(value)
  if (scpMatch) return toCanonical(scpMatch[1], scpMatch[2])

  try {
    const url = new URL(value)
    if (url.hostname.toLowerCase() !== 'github.com' || url.port || url.search || url.hash)
      return null

    if (url.protocol === 'https:') {
      if (url.username || url.password) return null
    } else if (url.protocol === 'ssh:') {
      if (url.username !== 'git' || url.password) return null
    } else {
      return null
    }

    const segments = url.pathname.replace(/^\//, '').split('/')
    if (segments.length !== 2 || segments.some((segment) => !segment)) return null
    const repository = segments[1].replace(/\.git$/i, '')
    return toCanonical(segments[0], repository)
  } catch {
    return null
  }
}

function toCanonical(owner: string, repository: string): CanonicalGitHubRemote | null {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner)) return null
  if (!/^[A-Za-z0-9._-]+$/.test(repository)) return null
  return {
    owner,
    repository,
    key: `${owner.toLowerCase()}/${repository.toLowerCase()}`
  }
}
