import { GitHubIntegrationError } from './github-auth.service'

export function toGitHubApiError(error: unknown): Error {
  const status = getGitHubErrorStatus(error)
  if (status === 401) return new GitHubIntegrationError('reconnect-required')
  if (status === 404) return new Error('github.notFound')
  if (isGitHubRateLimitError(error)) return new Error('github.rateLimited')
  if (status === 403) return new Error('github.permissionDenied')
  if (status === 409) return new Error('github.conflict')
  if (status === 422) return new Error('github.ruleOrValidationFailed')
  return new GitHubIntegrationError('network-error')
}

export function isGitHubRateLimitError(error: unknown): boolean {
  const status = getGitHubErrorStatus(error)
  if (status === 429) return true
  if (status !== 403) return false

  if (getHeader(error, 'x-ratelimit-remaining') === '0') return true
  if (getHeader(error, 'retry-after')) return true

  const providerMessage = getProviderMessage(error)
  return /secondary rate limit|rate limit exceeded|abuse detection/i.test(providerMessage)
}

export function getGitHubErrorStatus(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status?: unknown }).status)
    : undefined
}

function getHeader(error: unknown, name: string): string | undefined {
  if (typeof error !== 'object' || error === null || !('response' in error)) return undefined
  const response = (error as { response?: { headers?: unknown } }).response
  const headers = response?.headers
  if (!headers) return undefined

  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    return headers.get(name) ?? undefined
  }
  if (typeof headers !== 'object') return undefined
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (key.toLowerCase() === name.toLowerCase() && value !== undefined) return String(value)
  }
  return undefined
}

function getProviderMessage(error: unknown): string {
  if (typeof error !== 'object' || error === null) return ''
  const messages: string[] = []
  const directMessage = 'message' in error ? (error as { message?: unknown }).message : undefined
  if (typeof directMessage === 'string') messages.push(directMessage)

  if ('response' in error) {
    const response = (error as { response?: { data?: unknown } }).response
    const data = response?.data
    if (typeof data === 'object' && data !== null && 'message' in data) {
      const responseMessage = (data as { message?: unknown }).message
      if (typeof responseMessage === 'string') messages.push(responseMessage)
    }
  }
  return messages.join('\n')
}
