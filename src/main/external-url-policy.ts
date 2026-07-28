const GITHUB_OWNER = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?'
const GITHUB_REPOSITORY = '[A-Za-z0-9._-]+'
const GITHUB_REPOSITORY_PATH = new RegExp(`^/${GITHUB_OWNER}/${GITHUB_REPOSITORY}/?$`)
const SPACEZERO_RELEASES_URL = 'https://github.com/bity-labs/spacezero/releases'

export function isAllowedGitHubRepositoryUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.href === value &&
      url.protocol === 'https:' &&
      url.host === 'github.com' &&
      !url.username &&
      !url.password &&
      !value.includes('?') &&
      !value.includes('#') &&
      (GITHUB_REPOSITORY_PATH.test(url.pathname) || value === SPACEZERO_RELEASES_URL)
    )
  } catch {
    return false
  }
}
