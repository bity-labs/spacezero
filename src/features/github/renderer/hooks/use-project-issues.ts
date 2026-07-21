import { useQuery } from '@tanstack/react-query'

export function useProjectIssues(projectId: string, page: number) {
  return useQuery({
    queryKey: ['github', 'issues', projectId, page],
    queryFn: () => window.spacezero.github.listIssues({ projectId, page }),
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always'
  })
}

export function useProjectIssue(projectId: string, number: number) {
  return useQuery({
    queryKey: ['github', 'issue', projectId, number],
    queryFn: () => window.spacezero.github.getIssue({ projectId, number }),
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always'
  })
}

export function useProjectIssueComments(projectId: string, number: number, page: number) {
  return useQuery({
    queryKey: ['github', 'issue-comments', projectId, number, page],
    queryFn: () => window.spacezero.github.listIssueComments({ projectId, number, page }),
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always'
  })
}
