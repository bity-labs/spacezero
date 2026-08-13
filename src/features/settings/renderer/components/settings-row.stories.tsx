import type { Meta, StoryObj } from '@storybook/react-vite'

import { Card } from '@renderer/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'

import { SettingsRow } from './settings-row'

const meta = {
  title: 'Settings/Building Blocks/Row',
  component: SettingsRow,
  decorators: [
    (Story) => (
      <Card className="w-[40rem] max-w-[calc(100vw-2rem)] gap-0 py-0">
        <Story />
      </Card>
    )
  ]
} satisfies Meta<typeof SettingsRow>

export default meta

type Story = StoryObj<typeof meta>

type LanguagePreferenceValue = 'system' | 'english' | 'french'

const languagePreferenceLabels: Record<LanguagePreferenceValue, string> = {
  system: 'System',
  english: 'English',
  french: 'French'
}

export const LanguagePreference: Story = {
  args: {
    title: 'Language',
    description: 'Choose the language used in Space Zero.',
    children: (
      <Select defaultValue="system">
        <SelectTrigger aria-label="Language" size="sm" className="w-36">
          <SelectValue>
            {(value: LanguagePreferenceValue) => languagePreferenceLabels[value]}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="system">System</SelectItem>
          <SelectItem value="english">English</SelectItem>
          <SelectItem value="french">French</SelectItem>
        </SelectContent>
      </Select>
    )
  }
}
