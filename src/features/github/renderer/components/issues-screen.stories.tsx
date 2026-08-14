import type { Meta, StoryObj } from '@storybook/react-vite'

import { issueCommentsFixture, issueFixture, secondIssueFixture } from './github-screens.fixtures'
import { IssueDetailScreen, IssueListScreen } from './issues-screen'

const noOp = (): void => undefined

const listMeta = {
  title: 'Screens/GitHub/Issues',
  component: IssueListScreen,
  parameters: { layout: 'padded' },
  args: {
    state: { status: 'ready', items: [issueFixture, secondIssueFixture], page: 1, hasNextPage: true },
    fetching: false,
    onRefresh: noOp,
    onRetry: noOp,
    onPageChange: noOp,
    onOpenIssue: noOp
  }
} satisfies Meta<typeof IssueListScreen>

export default listMeta
type ListStory = StoryObj<typeof listMeta>

export const List: ListStory = {}
export const Loading: ListStory = { args: { state: { status: 'loading' }, fetching: true } }
export const Empty: ListStory = { args: { state: { status: 'ready', items: [], page: 1, hasNextPage: false } } }
export const Error: ListStory = { args: { state: { status: 'error', message: 'Issues could not be loaded. Try again.' } } }

export const Detail: StoryObj<typeof IssueDetailScreen> = {
  render: () => (
    <IssueDetailScreen
      number={issueFixture.number}
      state={{ status: 'ready', issue: issueFixture }}
      comments={{ status: 'ready', items: issueCommentsFixture, hasNextPage: false }}
      fetching={false}
      isStartingSession={false}
      startSessionError={null}
      onBack={noOp}
      onRefresh={noOp}
      onRetry={noOp}
      onRetryComments={noOp}
      onLoadMoreComments={noOp}
      onStartSession={noOp}
    />
  )
}

export const DetailLoading: StoryObj<typeof IssueDetailScreen> = {
  render: () => (
    <IssueDetailScreen
      number={455}
      state={{ status: 'loading' }}
      comments={{ status: 'loading' }}
      fetching
      isStartingSession={false}
      startSessionError={null}
      onBack={noOp}
      onRefresh={noOp}
      onRetry={noOp}
      onRetryComments={noOp}
      onLoadMoreComments={noOp}
    />
  )
}

export const CommentsError: StoryObj<typeof IssueDetailScreen> = {
  render: () => (
    <IssueDetailScreen
      number={issueFixture.number}
      state={{ status: 'ready', issue: issueFixture }}
      comments={{ status: 'error', message: 'Comments could not be loaded.', items: [] }}
      fetching={false}
      isStartingSession={false}
      startSessionError={null}
      onBack={noOp}
      onRefresh={noOp}
      onRetry={noOp}
      onRetryComments={noOp}
      onLoadMoreComments={noOp}
      onStartSession={noOp}
    />
  )
}

export const StartingSession: StoryObj<typeof IssueDetailScreen> = {
  render: () => (
    <IssueDetailScreen
      number={issueFixture.number}
      state={{ status: 'ready', issue: issueFixture }}
      comments={{ status: 'ready', items: issueCommentsFixture, hasNextPage: false }}
      fetching={false}
      isStartingSession
      startSessionError={null}
      onBack={noOp}
      onRefresh={noOp}
      onRetry={noOp}
      onRetryComments={noOp}
      onLoadMoreComments={noOp}
      onStartSession={noOp}
    />
  )
}
