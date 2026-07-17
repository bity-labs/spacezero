import { GitHubIntegrationError } from './github-auth.service'

export function toGitHubApiError(error: unknown): Error {
  const status = getStatus(error)
  if (status === 401) return new GitHubIntegrationError('reconnect-required')
  if (status === 404) return new Error('github.notFound')
  if (status === 403 && getRateLimitRemaining(error) === '0') return new Error('github.rateLimited')
  if (status === 403) return new Error('github.permissionDenied')
  if (status === 409) return new Error('github.conflict')
  if (status === 422) return new Error('github.validationFailed')
  return new GitHubIntegrationError('network-error')
}

function getStatus(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status?: unknown }).status)
    : undefined
}

function getRateLimitRemaining(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('response' in error)) return undefined
  const response = (error as { response?: { headers?: Record<string, unknown> } }).response
  const value = response?.headers?.['x-ratelimit-remaining']
  return value === undefined ? undefined : String(value)
}
