export function githubReadErrorMessage(error: unknown, subject: string): string {
  const message = String(error)
  if (message.includes('github.rateLimited')) {
    return `GitHub's rate limit was reached while loading ${subject}. Try again later.`
  }
  if (message.includes('github.repositoryAccessRevoked')) {
    return `Repository access was revoked. Restore GitHub App access before loading ${subject}.`
  }
  if (message.includes('github.reconnect-required')) {
    return `GitHub authorization is stale. Reconnect before loading ${subject}.`
  }
  if (message.includes('github.notFound') || message.includes('github.issueNotFound')) {
    return `The requested ${subject} could not be found.`
  }
  if (message.includes('github.permissionDenied')) {
    return `GitHub denied access to ${subject}. Check repository permissions.`
  }
  return `Could not load ${subject} because of a network or GitHub error. Try again.`
}

export function githubMutationErrorMessage(error: unknown): string {
  const message = String(error)
  if (message.includes('github.rateLimited'))
    return "GitHub's rate limit was reached. Try again later."
  if (message.includes('github.permissionDenied')) {
    return 'GitHub denied this change. Check your repository permissions.'
  }
  if (message.includes('github.ruleOrValidationFailed')) {
    return 'GitHub rejected this change because it violates a repository rule or GitHub validation.'
  }
  if (message.includes('github.conflict')) {
    return 'The GitHub item changed. Refresh it before trying again.'
  }
  if (
    message.includes('github.reconnect-required') ||
    message.includes('github.repositoryAccessRevoked')
  ) {
    return 'GitHub authorization is stale or revoked. Reconnect and try again.'
  }
  return 'GitHub did not confirm the change. Check your network and try again.'
}
