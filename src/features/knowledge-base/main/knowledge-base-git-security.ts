const CREDENTIAL_URL_PATTERN = /([a-z][a-z\d+.-]*:\/\/)[^\s/?#]*@/gi
const SENSITIVE_QUERY_VALUE_PATTERN = /([?&](?:access_token|api_key|key|password|token)=)[^&#\s]*/gi

export function sanitizeGitRemoteUrl(remoteUrl: string): string {
  const trimmedUrl = remoteUrl.trim()

  try {
    const url = new URL(trimmedUrl)
    url.username = ''
    url.password = ''
    redactSensitiveQueryValues(url)
    return url.toString()
  } catch {
    return redactGitSecrets(trimmedUrl)
  }
}

export function redactGitSecrets(message: string): string {
  return message
    .replace(CREDENTIAL_URL_PATTERN, '$1[redacted]@')
    .replace(SENSITIVE_QUERY_VALUE_PATTERN, '$1[redacted]')
}

export function toRedactedGitError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)
  return new Error(redactGitSecrets(message))
}

function redactSensitiveQueryValues(url: URL): void {
  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:access_token|api_key|key|password|token)$/i.test(key)) {
      url.searchParams.set(key, '[redacted]')
    }
  }
}
