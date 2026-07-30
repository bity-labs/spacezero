import { z } from 'zod'

import { defineWorkspaceTool } from '../../agent-workspace/main/workspace-tool.model'
import type { GitHubCreateOrReusePullRequestResult } from '../shared'

const createOrReusePullRequestToolSchema = z
  .object({
    expectedHeadSha: z.string().regex(/^[0-9a-f]{40}$/i),
    title: z.string().trim().min(1).max(256),
    body: z.string().trim().max(65_536).optional()
  })
  .strict()

export type GitHubPullRequestCreationCapability = {
  createOrReusePullRequest: (request: {
    sessionId: string
    expectedHeadSha: string
    title: string
    body?: string
  }) => Promise<GitHubCreateOrReusePullRequestResult>
}

export function createGitHubTools(service?: GitHubPullRequestCreationCapability) {
  return [
    defineWorkspaceTool({
      name: 'github.createOrReusePullRequest',
      description:
        'After a successful push, create or exactly reuse a non-draft GitHub Pull Request for this Project Session. Space Zero resolves the linked repository, managed head branch, and authorized default base in main; revalidates GitHub App access; and never exposes credentials. Pass the pushed commit SHA from `git rev-parse HEAD`. The structured result always distinguishes push success from Pull Request creation failure.',
      safetyLevel: 'dangerous',
      kind: 'app-state',
      domain: 'github',
      inputSchema: createOrReusePullRequestToolSchema,
      agentParameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          expectedHeadSha: { type: 'string' },
          title: { type: 'string' },
          body: { type: 'string' }
        },
        required: ['expectedHeadSha', 'title']
      },
      confirmationSummary: () => 'Create or reuse a GitHub Pull Request for the pushed branch',
      handler: async (input, context) => {
        if (!context?.sessionId || context.sessionId === 'unknown') {
          return {
            ok: false,
            error: {
              code: 'github.sessionUnavailable',
              message: 'A live Project Session is required.'
            }
          }
        }
        const capability =
          service ?? (await import('./github-runtime')).getGitHubPullRequestsService()
        return {
          ok: true,
          data: await capability.createOrReusePullRequest({
            sessionId: context.sessionId,
            expectedHeadSha: input.expectedHeadSha,
            title: input.title,
            ...(input.body ? { body: input.body } : {})
          })
        }
      }
    })
  ]
}
