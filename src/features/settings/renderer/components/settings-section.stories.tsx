import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Switch } from '@renderer/components/ui/switch'
import { Text } from '@renderer/components/ui/typography'

import { SettingsRow } from './settings-row'
import { SettingsSection } from './settings-section'

const meta = {
  title: 'Settings/Building Blocks/Section',
  component: SettingsSection,
  decorators: [
    (Story) => (
      <div className="w-[40rem] max-w-[calc(100vw-2rem)]">
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof SettingsSection>

export default meta

type Story = StoryObj<typeof meta>

export const Appearance: Story = {
  args: {
    title: 'Appearance',
    description: 'Choose how Space Zero looks while you work.',
    footer: <Text variant="subtle">Changes apply immediately.</Text>,
    children: (
      <>
        <SettingsRow title="Theme" description="Choose the interface color theme.">
          <Select defaultValue="dark">
            <SelectTrigger aria-label="Theme" size="sm" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">System</SelectItem>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>
        <SettingsRow
          title="Use thin font anti-aliasing"
          description="Use thinner browser-style font rendering."
        >
          <Switch aria-label="Use thin font anti-aliasing" defaultChecked />
        </SettingsRow>
      </>
    )
  }
}
