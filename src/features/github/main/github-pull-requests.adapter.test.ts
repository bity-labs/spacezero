import { describe, expect, it } from 'vitest'

import { classifyPullRequestPatch } from './github-pull-requests.adapter'

describe('GitHub Pull Request patch classification', () => {
  it('marks a complete text patch as available', () => {
    expect(
      classifyPullRequestPatch({
        patch: '@@ -1 +1,2 @@\n-old\n+new\n+line',
        changes: 3,
        additions: 2,
        deletions: 1
      })
    ).toEqual({
      status: 'available',
      text: '@@ -1 +1,2 @@\n-old\n+new\n+line',
      truncated: false
    })
  })

  it('marks an incomplete text patch as truncated', () => {
    expect(
      classifyPullRequestPatch({
        patch: '@@ -1 +1 @@\n-old\n+new',
        changes: 10,
        additions: 5,
        deletions: 5
      })
    ).toMatchObject({ status: 'available', truncated: true })
  })

  it.each([
    [{ patch: undefined, changes: 0, additions: 0, deletions: 0 }, 'binary'],
    [{ patch: undefined, changes: 500, additions: 300, deletions: 200 }, 'omitted'],
    [{ patch: null, changes: 1, additions: 1, deletions: 0 }, 'unavailable']
  ] as const)('represents a missing patch as %s', (file, status) => {
    expect(classifyPullRequestPatch(file)).toEqual({ status })
  })
})
