import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  baseFilesToolFixture,
  conflictFilesToolFixture,
  contentSearchEmptyFilesToolFixture,
  contentSearchErrorFilesToolFixture,
  contentSearchLoadingFilesToolFixture,
  contentSearchResultsFilesToolFixture,
  createFileDialogFilesToolFixture,
  createFolderDialogFilesToolFixture,
  dirtyTabFilesToolFixture,
  emptyTreeFilesToolFixture,
  FilesToolSidePaneFixture,
  fileNameSearchEmptyFilesToolFixture,
  fileNameSearchFilesToolFixture,
  missingFileFilesToolFixture,
  nestedTreeFilesToolFixture,
  noFileSelectedFilesToolFixture,
  permanentTabFilesToolFixture,
  previewTabFilesToolFixture,
  richMarkdownFilesEditorFixture,
  treeErrorFilesToolFixture,
  treeLoadingFilesToolFixture,
  unsavedChangesDialogFilesToolFixture
} from './files-tool-view.fixtures'

const meta = {
  title: 'Features/Files/Screens/Tool',
  component: FilesToolSidePaneFixture,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="h-screen min-h-[620px] w-screen min-w-[1120px] bg-background">
        <Story />
      </div>
    )
  ],
  args: baseFilesToolFixture
} satisfies Meta<typeof FilesToolSidePaneFixture>

export default meta

type Story = StoryObj<typeof meta>

export const NoFileSelected: Story = { args: noFileSelectedFilesToolFixture }
export const TreeLoading: Story = { args: treeLoadingFilesToolFixture }
export const TreeError: Story = { args: treeErrorFilesToolFixture }
export const EmptyTree: Story = { args: emptyTreeFilesToolFixture }
export const NestedTree: Story = { args: nestedTreeFilesToolFixture }
export const FileNameSearchActive: Story = { args: fileNameSearchFilesToolFixture }
export const FileNameSearchNoResults: Story = { args: fileNameSearchEmptyFilesToolFixture }
export const ContentSearchLoading: Story = { args: contentSearchLoadingFilesToolFixture }
export const ContentSearchResults: Story = { args: contentSearchResultsFilesToolFixture }
export const ContentSearchNoResults: Story = { args: contentSearchEmptyFilesToolFixture }
export const ContentSearchError: Story = { args: contentSearchErrorFilesToolFixture }
export const PreviewTab: Story = { args: previewTabFilesToolFixture }
export const PermanentTab: Story = { args: permanentTabFilesToolFixture }
export const DirtyTab: Story = { args: dirtyTabFilesToolFixture }
export const MissingFile: Story = { args: missingFileFilesToolFixture }
export const Conflict: Story = { args: conflictFilesToolFixture }
export const RichMarkdownMode: Story = { args: richMarkdownFilesEditorFixture }
export const CreateFileDialog: Story = { args: createFileDialogFilesToolFixture }
export const CreateFolderDialog: Story = { args: createFolderDialogFilesToolFixture }
export const UnsavedChangesDialog: Story = { args: unsavedChangesDialogFilesToolFixture }
