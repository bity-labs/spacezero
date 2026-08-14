import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorName
} from './model-selector'

const meta = {
  title: 'Design System/Components/Agent Chat/Model Selector',
  component: ModelSelector,
  render: () => (
    <ModelSelector defaultOpen>
      <ModelSelectorContent>
        <ModelSelectorInput placeholder="Search models" />
        <ModelSelectorList>
          <ModelSelectorGroup heading="Models">
            <ModelSelectorItem>
              <ModelSelectorName>Claude Sonnet</ModelSelectorName>
            </ModelSelectorItem>
            <ModelSelectorItem>
              <ModelSelectorName>GPT</ModelSelectorName>
            </ModelSelectorItem>
          </ModelSelectorGroup>
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  )
} satisfies Meta<typeof ModelSelector>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}
