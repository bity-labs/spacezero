import { nanoid } from 'nanoid'

export const PI_SESSION_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/

/**
 * Generates a full-entropy Nano ID that satisfies Pi's SessionManager ID contract.
 * Invalid boundary candidates are discarded rather than rewritten, preserving a
 * one-to-one mapping from accepted random values to persisted IDs.
 */
export function createPiSessionId(createCandidate: () => string = nanoid): string {
  let candidate: string
  do {
    candidate = createCandidate()
  } while (!PI_SESSION_ID_PATTERN.test(candidate))
  return candidate
}
