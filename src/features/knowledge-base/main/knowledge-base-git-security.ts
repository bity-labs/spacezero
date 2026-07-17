const URL_IN_TEXT_PATTERN = /[a-z][a-z\d+.-]*:\/\/[^\s'"<>]+/gi
const FALLBACK_CREDENTIAL_PATTERN = /([a-z][a-z\d+.-]*:\/\/)[^\s/?#]*@/gi

export function sanitizeGitRemoteUrl(remoteUrl: string): string {
  const trimmedUrl = remoteUrl.trim()

  try {
    const url = new URL(trimmedUrl)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return sanitizeNonStandardGitRemote(trimmedUrl)
  }
}

export function redactGitSecrets(message: string): string {
  return message
    .replace(URL_IN_TEXT_PATTERN, (url) => sanitizeGitRemoteUrl(url))
    .replace(FALLBACK_CREDENTIAL_PATTERN, '$1')
}

export function toRedactedGitError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)
  return new Error(redactGitSecrets(message))
}

function sanitizeNonStandardGitRemote(remoteUrl: string): string {
  const withoutQueryOrFragment = remoteUrl.split(/[?#]/, 1)[0] ?? ''
  const scpStyle = /^(?:[^@\s/:]+@)?([^:\s/]+):(.+)$/.exec(
    withoutQueryOrFragment
  )
  if (scpStyle) return `${scpStyle[1]}:${scpStyle[2]}`

  return withoutQueryOrFragment.replace(FALLBACK_CREDENTIAL_PATTERN, '$1')
}
