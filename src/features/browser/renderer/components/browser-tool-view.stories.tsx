import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  blankTabBrowserFixture,
  BrowserToolSidePaneFixture,
  disabledHistoryBrowserFixture,
  downloadCompleteBrowserFixture,
  downloadFailedBrowserFixture,
  downloadInProgressBrowserFixture,
  failedLoadBrowserFixture,
  focusedAddressBrowserFixture,
  loadedPageBrowserFixture,
  loadingUrlBrowserFixture
} from './browser-tool-view.fixtures'

const meta = {
  title: 'Features/Browser/Screens/Tool',
  component: BrowserToolSidePaneFixture,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="h-screen min-h-[620px] w-screen min-w-[960px] bg-background">
        <Story />
      </div>
    )
  ],
  args: blankTabBrowserFixture
} satisfies Meta<typeof BrowserToolSidePaneFixture>

export default meta

type Story = StoryObj<typeof meta>

export const BlankTab: Story = {}
export const LoadingUrl: Story = { args: loadingUrlBrowserFixture }
export const LoadedPageTitleAndFavicon: Story = { args: loadedPageBrowserFixture }
export const FailedLoad: Story = { args: failedLoadBrowserFixture }
export const BackAndForwardDisabled: Story = { args: disabledHistoryBrowserFixture }
export const AddressFocused: Story = { args: focusedAddressBrowserFixture }
export const DownloadInProgress: Story = { args: downloadInProgressBrowserFixture }
export const DownloadComplete: Story = { args: downloadCompleteBrowserFixture }
export const DownloadFailed: Story = { args: downloadFailedBrowserFixture }
