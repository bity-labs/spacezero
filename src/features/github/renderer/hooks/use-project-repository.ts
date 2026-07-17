import { useQuery } from '@tanstack/react-query'

export const githubQueryKeys = {
  repository: (projectId: string) => ['github', 'projects', projectId, 'repository'] as const
}

export function useProjectRepository(projectId: string, enabled = true) {
  return useQuery({
    queryKey: githubQueryKeys.repository(projectId),
    queryFn: () => window.spacezero.github.getProjectRepository({ projectId }),
    enabled
  })
}
