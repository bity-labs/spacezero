import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";

import {
  GenerationLoader,
  type GenerationLoaderVariant,
} from "@spacezero/ui/components/assistant-ui/elements/loading-state";

const meta: Meta<typeof GenerationLoader> = {
  title: "Design System/Assistant UI/Elements/Loading State",
  component: GenerationLoader,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[42rem] max-w-[calc(100vw-2rem)] p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    label: "Loading chat",
    tick: 0,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

function LoaderDemo({ label, variant }: { label: string; variant?: GenerationLoaderVariant }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((current) => current + 1), 120);
    return () => window.clearInterval(id);
  }, []);

  return <GenerationLoader label={label} tick={tick} {...(variant ? { variant } : {})} />;
}

export const LoadingChat: Story = {
  render: () => <LoaderDemo label="Loading chat" />,
};

export const StartingSession: Story = {
  render: () => <LoaderDemo label="Starting session" variant="rounded" />,
};

export const PreparingTools: Story = {
  render: () => <LoaderDemo label="Preparing tools" variant="squares" />,
};
