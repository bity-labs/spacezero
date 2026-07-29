import { useQuery } from '@tanstack/react-query'

export function useProjectPullRequests(projectId: string, page: number) {
  return useQuery({
    queryKey: ['github', 'pull-requests', projectId, page],
    queryFn: () => window.spacezero.github.listPullRequests({ projectId, page }),
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always'
  })
}

export function useProjectPullRequest(projectId: string, number: number) {
  return useQuery({
    queryKey: ['github', 'pull-request', projectId, number],
    queryFn: () => window.spacezero.github.getPullRequest({ projectId, number }),
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always'
  })
}

export function useProjectPullRequestCommits(
  projectId: string,
  number: number,
  page: number,
  perPage?: number
) {
  return useQuery({
    queryKey: ['github', 'pull-request-commits', projectId, number, page, perPage],
    queryFn: () =>
      window.spacezero.github.listPullRequestCommits({ projectId, number, page, perPage }),
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always'
  })
}

export function useProjectPullRequestFiles(projectId: string, number: number, page: number) {
  return useQuery({
    queryKey: ['github', 'pull-request-files', projectId, number, page],
    queryFn: () => window.spacezero.github.listPullRequestFiles({ projectId, number, page }),
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always'
  })
}

export function useProjectPullRequestCheckRuns(projectId: string, number: number, page: number) {
  return useQuery({
    queryKey: ['github', 'pull-request-check-runs', projectId, number, page],
    queryFn: () => window.spacezero.github.listPullRequestCheckRuns({ projectId, number, page }),
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always'
  })
}

export function useProjectPullRequestCommitStatuses(
  projectId: string,
  number: number,
  page: number
) {
  return useQuery({
    queryKey: ['github', 'pull-request-commit-statuses', projectId, number, page],
    queryFn: () =>
      window.spacezero.github.listPullRequestCommitStatuses({ projectId, number, page }),
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always'
  })
}

export function useProjectPullRequestReviews(projectId: string, number: number, page: number) {
  return useQuery({
    queryKey: ['github', 'pull-request-reviews', projectId, number, page],
    queryFn: () => window.spacezero.github.listPullRequestReviews({ projectId, number, page }),
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always'
  })
}

export function useProjectPullRequestComments(
  projectId: string,
  number: number,
  page: number,
  perPage?: number
) {
  return useQuery({
    queryKey: ['github', 'pull-request-comments', projectId, number, page, perPage],
    queryFn: () =>
      window.spacezero.github.listPullRequestComments({ projectId, number, page, perPage }),
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always'
  })
}
