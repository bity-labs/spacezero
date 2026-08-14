import type { KnowledgeBaseUnavailableScreenProps } from './knowledge-base-unavailable-screen'

const noOp = (): void => undefined

export const unavailableKnowledgeBaseFixture = {
  rootPath: '/Users/builder/SpaceZero/knowledge-base',
  reason: 'missing',
  error: null,
  isRecovering: false,
  onReconnect: noOp,
  onResetConfiguration: noOp
} satisfies KnowledgeBaseUnavailableScreenProps

export const unavailableErrorKnowledgeBaseFixture = {
  ...unavailableKnowledgeBaseFixture,
  reason: 'inaccessible',
  error: 'Space Zero could not access this repository. Check its permissions before reconnecting.'
} satisfies KnowledgeBaseUnavailableScreenProps
