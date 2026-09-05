import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessage,
} from "@assistant-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactElement } from "react";

import { Thread, type ThreadProps } from "@spacezero/ui/components/thread";

const timestamp = new Date("2026-01-01T00:00:00.000Z");
const messages: readonly ThreadMessage[] = [
  {
    id: "fixture-user-message",
    role: "user",
    createdAt: timestamp,
    content: [{ type: "text", text: "Show me what changed in this session." }],
    attachments: [],
    metadata: { custom: {} },
  },
  {
    id: "fixture-assistant-message",
    role: "assistant",
    createdAt: timestamp,
    content: [
      {
        type: "text",
        text: "Here is the saved answer from the Host-backed conversation history.",
      },
    ],
    status: { type: "complete", reason: "stop" },
    metadata: {
      unstable_state: null,
      unstable_annotations: [],
      unstable_data: [],
      steps: [],
      custom: {},
    },
  },
];

function RuntimeFixture({
  messages: fixtureMessages = messages,
  thread,
}: {
  readonly messages?: readonly ThreadMessage[];
  readonly thread: ThreadProps;
}): ReactElement {
  const runtime = useExternalStoreRuntime({
    messages: fixtureMessages,
    isDisabled: true,
    isSendDisabled: true,
    isLoading: thread.state === "loading",
    onNew: async () => undefined,
    unstable_enableToolInvocations: false,
  });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="h-[32rem] w-[44rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border bg-background">
        <Thread {...thread} />
      </div>
    </AssistantRuntimeProvider>
  );
}

const meta: Meta<typeof RuntimeFixture> = {
  title: "Design System/Primitives/Thread",
  component: RuntimeFixture,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  args: {
    thread: { state: "ready" },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const SavedHistory: Story = {};

export const Loading: Story = {
  args: {
    messages: [],
    thread: { state: "loading" },
  },
};

export const Empty: Story = {
  args: {
    messages: [],
    thread: { state: "empty" },
  },
};

export const QueryFailure: Story = {
  args: {
    messages: [],
    thread: { state: "error", errorMessage: "The Host query failed." },
  },
};
