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

export function useProjectPullRequestComments(projectId: string, number: number, page: number) {
  return useQuery({
    queryKey: ['github', 'pull-request-comments', projectId, number, page],
    queryFn: () => window.spacezero.github.listPullRequestComments({ projectId, number, page }),
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always'
  })
}
