import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  pullRequestChecksFixture,
  pullRequestFixture,
  pullRequestReviewsFixture,
  secondPullRequestFixture
} from './github-screens.fixtures'
import { PullRequestDetailScreen, PullRequestListScreen } from './pull-requests-screen'

const noOp = (): void => undefined

const meta = {
  title: 'Features/GitHub/Screens/Pull Requests',
  component: PullRequestListScreen,
  parameters: { layout: 'padded' },
  args: {
    state: { status: 'ready', items: [pullRequestFixture, secondPullRequestFixture], page: 1, hasNextPage: true },
    fetching: false,
    onRefresh: noOp,
    onRetry: noOp,
    onPageChange: noOp,
    onOpenPullRequest: noOp
  }
} satisfies Meta<typeof PullRequestListScreen>

export default meta
type ListStory = StoryObj<typeof meta>

export const List: ListStory = {}
export const Loading: ListStory = { args: { state: { status: 'loading' }, fetching: true } }
export const Empty: ListStory = { args: { state: { status: 'ready', items: [], page: 1, hasNextPage: false } } }
export const Error: ListStory = { args: { state: { status: 'error', message: 'Pull Requests could not be loaded. Try again.' } } }

function DetailStory({ checks = pullRequestChecksFixture, reviews = pullRequestReviewsFixture }: { checks?: typeof pullRequestChecksFixture; reviews?: typeof pullRequestReviewsFixture }): React.JSX.Element {
  return (
    <PullRequestDetailScreen
      number={pullRequestFixture.number}
      state={{ status: 'ready', pullRequest: pullRequestFixture }}
      comments={{ status: 'ready', items: [], hasNextPage: false }}
      checks={{ status: 'ready', items: checks }}
      reviews={{ status: 'ready', items: reviews }}
      fetching={false}
      onBack={noOp}
      onRefresh={noOp}
      onRetry={noOp}
      onRetryComments={noOp}
      onLoadMoreComments={noOp}
    />
  )
}

export const Detail: StoryObj<typeof PullRequestDetailScreen> = { render: () => <DetailStory /> }
export const Checks: StoryObj<typeof PullRequestDetailScreen> = { render: () => <DetailStory reviews={[]} /> }
export const Reviews: StoryObj<typeof PullRequestDetailScreen> = { render: () => <DetailStory checks={[]} /> }
export const DetailLoading: StoryObj<typeof PullRequestDetailScreen> = {
  render: () => (
    <PullRequestDetailScreen
      number={471}
      state={{ status: 'loading' }}
      comments={{ status: 'loading' }}
      checks={{ status: 'loading' }}
      reviews={{ status: 'loading' }}
      fetching
      onBack={noOp}
      onRefresh={noOp}
      onRetry={noOp}
      onRetryComments={noOp}
      onLoadMoreComments={noOp}
    />
  )
}
export const DetailError: StoryObj<typeof PullRequestDetailScreen> = {
  render: () => (
    <PullRequestDetailScreen
      number={471}
      state={{ status: 'error', message: 'Pull Request could not be loaded. Try again.' }}
      comments={{ status: 'loading' }}
      checks={{ status: 'loading' }}
      reviews={{ status: 'loading' }}
      fetching={false}
      onBack={noOp}
      onRefresh={noOp}
      onRetry={noOp}
      onRetryComments={noOp}
      onLoadMoreComments={noOp}
    />
  )
}
