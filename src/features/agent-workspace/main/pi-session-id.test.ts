import { SessionManager } from '@earendil-works/pi-coding-agent'
import { nanoid, urlAlphabet } from 'nanoid'
import { describe, expect, it, vi } from 'vitest'

import { createPiSessionId, PI_SESSION_ID_PATTERN } from './pi-session-id'

describe('createPiSessionId', () => {
  it('rejects invalid boundary candidates without rewriting or truncating the accepted ID', () => {
    const candidate = vi
      .fn<() => string>()
      .mockReturnValueOnce('_same-interior-value')
      .mockReturnValueOnce('-same-interior-value')
      .mockReturnValueOnce('0same-interior-value')

    const sessionId = createPiSessionId(candidate)

    expect(sessionId).toBe('0same-interior-value')
    expect(candidate).toHaveBeenCalledTimes(3)
    expect(() => SessionManager.inMemory('/tmp', { id: sessionId })).not.toThrow()
  })

  it('keeps Nano ID entropy while deterministically accounting for the million-ID boundary evidence', () => {
    const acceptedBoundaryPairs = [...urlAlphabet].flatMap((first) =>
      [...urlAlphabet].map((last) => `${first}${'a'.repeat(19)}${last}`)
    )
    const invalidBoundaryPairs = acceptedBoundaryPairs.filter(
      (candidate) => !PI_SESSION_ID_PATTERN.test(candidate)
    ).length
    const invalidProbability = invalidBoundaryPairs / urlAlphabet.length ** 2
    const expectedInvalidPerMillion = Math.round(invalidProbability * 1_000_000)
    const standardDeviation = Math.sqrt(1_000_000 * invalidProbability * (1 - invalidProbability))

    expect(urlAlphabet).toHaveLength(64)
    expect(21 * Math.log2(urlAlphabet.length)).toBe(126)
    expect(invalidBoundaryPairs).toBe(252)
    expect(expectedInvalidPerMillion).toBe(61_523)
    expect(Math.abs(61_685 - expectedInvalidPerMillion)).toBeLessThan(standardDeviation)
  })

  it('preserves the full accepted candidate and has negligible million-ID collision risk', () => {
    const validIdSpace = 62 ** 2 * 64 ** 19
    const millionIdCollisionUpperBound = 1_000_000 ** 2 / (2 * validIdSpace)
    const candidates = Array.from(
      { length: 10_000 },
      (_, index) => `A${index.toString(36).padStart(19, '0')}Z`
    )
    let index = 0
    const sessionIds = candidates.map(() => createPiSessionId(() => candidates[index++]!))
    const randomFormatSample = Array.from({ length: 1_000 }, () => createPiSessionId(nanoid))

    expect(millionIdCollisionUpperBound).toBeLessThan(1e-25)
    expect(sessionIds).toEqual(candidates)
    expect(new Set(sessionIds)).toHaveLength(sessionIds.length)
    expect(randomFormatSample.every((sessionId) => PI_SESSION_ID_PATTERN.test(sessionId))).toBe(
      true
    )
    expect(randomFormatSample.every((sessionId) => sessionId.length === 21)).toBe(true)
  })
})
