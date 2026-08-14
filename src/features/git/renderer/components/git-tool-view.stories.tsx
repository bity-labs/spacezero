import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  binaryFileGitToolFixture,
  changedFilesGitToolFixture,
  cleanRepositoryGitToolFixture,
  commitDisabledGitToolFixture,
  commitReadyGitToolFixture,
  conflictGitToolFixture,
  deletedFileGitToolFixture,
  errorGitToolFixture,
  loadingGitToolFixture,
  newFileGitToolFixture,
  noRepositoryGitToolFixture,
  renamedFileGitToolFixture
} from './git-tool-view.fixtures'
import { GitToolView } from './git-tool-view'

const meta = {
  title: 'Features/Git/Screens/Diff Tool',
  component: GitToolView,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="h-screen min-h-[620px] w-screen min-w-[720px] bg-background">
        <Story />
      </div>
    )
  ],
  args: changedFilesGitToolFixture
} satisfies Meta<typeof GitToolView>

export default meta

type Story = StoryObj<typeof meta>

export const CleanRepository: Story = { args: cleanRepositoryGitToolFixture }
export const ChangedFiles: Story = {}
export const NewFile: Story = { args: newFileGitToolFixture }
export const DeletedFile: Story = { args: deletedFileGitToolFixture }
export const RenamedFile: Story = { args: renamedFileGitToolFixture }
export const BinaryFile: Story = { args: binaryFileGitToolFixture }
export const Conflict: Story = { args: conflictGitToolFixture }
export const NoRepository: Story = { args: noRepositoryGitToolFixture }
export const Loading: Story = { args: loadingGitToolFixture }
export const Error: Story = { args: errorGitToolFixture }
export const CommitReady: Story = { args: commitReadyGitToolFixture }
export const CommitDisabled: Story = { args: commitDisabledGitToolFixture }
