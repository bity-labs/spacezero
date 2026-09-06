import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorRoot,
  ModelSelectorTrigger,
  type ModelOption,
} from "@spacezero/ui/components/assistant-ui/elements/model-selector";

const thinkingLevels = [
  { id: "minimal", name: "Min" },
  { id: "low", name: "Low" },
  { id: "medium", name: "Med" },
  { id: "high", name: "High" },
];

const models: ModelOption[] = [
  {
    id: "anthropic/claude-sonnet-4",
    name: "Claude Sonnet 4",
    description: "Balanced coding model",
    icon: <span className="text-[10px] font-semibold">A</span>,
    keywords: ["anthropic", "coding"],
    efforts: thinkingLevels,
  },
  {
    id: "openai/gpt-5",
    name: "GPT-5",
    description: "General reasoning model",
    icon: <span className="text-[10px] font-semibold">O</span>,
    keywords: ["openai"],
    efforts: true,
  },
  {
    id: "google/gemini-flash",
    name: "Gemini Flash",
    description: "Fast, large-context responses",
    icon: <span className="text-[10px] font-semibold">G</span>,
    keywords: ["google", "fast"],
  },
];

const meta: Meta<typeof ModelSelector> = {
  title: "Design System/Assistant UI/Elements/Model Selector",
  component: ModelSelector,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="flex h-80 w-[42rem] max-w-[calc(100vw-2rem)] items-start p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    models,
    defaultValue: models[0]!.id,
    defaultEffort: "medium",
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Searchable: Story = {
  args: {
    searchable: true,
  },
};

export const MutedSmall: Story = {
  args: {
    variant: "muted",
    size: "sm",
  },
};

function ControlledModelSelector() {
  const [model, setModel] = useState(models[0]!.id);
  const [effort, setEffort] = useState("medium");

  return (
    <ModelSelector
      models={models}
      value={model}
      onValueChange={setModel}
      effort={effort}
      onEffortChange={setEffort}
      searchable
    />
  );
}

export const Controlled: Story = {
  render: () => <ControlledModelSelector />,
};

export const CustomComposition: Story = {
  render: () => (
    <ModelSelectorRoot models={models} defaultValue={models[1]!.id} defaultEffort="high">
      <ModelSelectorTrigger variant="ghost" />
      <ModelSelectorContent searchable align="end" />
    </ModelSelectorRoot>
  ),
};
