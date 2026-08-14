import type { Meta, StoryObj } from '@storybook/react-vite'

import { repositoryOptionsFixture } from './github-screens.fixtures'
import { RepositorySetupView } from './repository-setup-view'

const noOp = (): void => undefined

const meta = {
  title: 'Features/GitHub/Screens/Repository Setup',
  component: RepositorySetupView,
  parameters: { layout: 'centered' },
  decorators: [(Story) => <div className="w-[min(42rem,90vw)] rounded-xl border bg-background p-6"><Story /></div>],
  args: {
    options: repositoryOptionsFixture,
    searchQuery: '',
    selectedRepositoryId: null,
    selectedExistingProjectId: null,
    progress: null,
    error: null,
    isStarting: false,
    agentResourcesTrusted: false,
    onSearchQueryChange: noOp,
    onSelectRepository: noOp,
    onSelectExistingProject: noOp,
    onAgentResourcesTrustedChange: noOp,
    onStart: noOp,
    onCancel: noOp,
    onConfigureAccess: noOp
  }
} satisfies Meta<typeof RepositorySetupView>

export default meta
type Story = StoryObj<typeof meta>

export const Loading: Story = { args: { options: null } }
export const Empty: Story = { args: { options: [] } }
export const RepositoryList: Story = {}
export const SearchEmpty: Story = { args: { searchQuery: 'missing-repository' } }
export const RepositorySelected: Story = { args: { selectedRepositoryId: 'repository-1' } }
export const CloneProgress: Story = {
  args: {
    selectedRepositoryId: 'repository-1',
    progress: { operationId: 'clone-1', status: 'cloning', message: 'Cloning repository…', percent: 64 }
  }
}
export const CloneError: Story = {
  args: {
    selectedRepositoryId: 'repository-1',
    progress: { operationId: 'clone-1', status: 'failed', message: 'Clone failed before the repository could be added.' },
    error: 'Check repository access, network, and destination, then retry.'
  }
}
