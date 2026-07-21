export function projectSessionSetupErrorMessage(error: unknown): string {
  const message = String(error)
  if (
    message.includes('project.notGitRepository') ||
    message.includes('session.projectNotGitRepository')
  ) {
    return 'This Project folder is not a Git repository. Choose a repository path or initialize Git with an initial commit, then retry.'
  }
  if (
    message.includes('project.repositoryHasNoCommits') ||
    message.includes('session.projectHasNoCommits')
  ) {
    return 'This Git repository has no commits. Create an initial commit, then retry the Session.'
  }
  if (message.includes('session.projectNotRepositoryRoot')) {
    return 'This Project points to a repository subdirectory. Edit the Project path to the repository root, then retry.'
  }
  return 'Space Zero could not create an isolated Session. Verify the Project path is a Git repository root with at least one commit, then retry.'
}
