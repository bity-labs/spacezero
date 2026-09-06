import { CodeIcon, PaperclipIcon, WrenchIcon } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import {
  applyMention,
  Composer,
  ComposerActions,
  ComposerAttachmentChip,
  ComposerAttachments,
  ComposerAttachButton,
  ComposerBar,
  ComposerCommandItem,
  ComposerContext,
  ComposerInput,
  ComposerMenu,
  ComposerModelItem,
  ComposerModelTrigger,
  ComposerPersonItem,
  ComposerSend,
  ComposerToolbar,
  ComposerVoice,
  ComposerVoiceButton,
  useMentionMatches,
  useSlashMatches,
  type ComposerAttachment,
  type ComposerCommand,
  type ComposerModel,
  type ComposerPerson,
} from "@spacezero/ui/components/assistant-ui/elements/composer";

const commands: ComposerCommand[] = [
  { name: "explain", description: "Explain the selected code", icon: CodeIcon },
  { name: "fix", description: "Find and fix a bug", icon: WrenchIcon },
  { name: "attach", description: "Attach project context", icon: PaperclipIcon },
];

const people: ComposerPerson[] = [
  { name: "planner", role: "agent" },
  { name: "reviewer", role: "agent" },
  { name: "Tiby", role: "human" },
];

const models: ComposerModel[] = [
  { name: "Claude Sonnet", meta: "200k" },
  { name: "GPT-5", meta: "400k" },
  { name: "Gemini Flash", meta: "1M" },
];

const attachments: ComposerAttachment[] = [
  { name: "session-plan.md", meta: "12 KB", state: "done", kind: "text" },
  { name: "screenshot.png", meta: "Uploading", state: "uploading", progress: 68, kind: "image" },
];

const meta: Meta<typeof Composer> = {
  title: "Design System/Assistant UI/Elements/Composer",
  component: Composer,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[42rem] max-w-[calc(100vw-2rem)] px-6 pt-32 pb-6">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

function ControlledComposer({ streaming = false }: { streaming?: boolean }) {
  const [text, setText] = useState("");
  const [modelOpen, setModelOpen] = useState(false);
  const slashMatches = useSlashMatches(text, commands);
  const mentionMatches = useMentionMatches(text, people);
  const menuOpen = slashMatches.length > 0 || mentionMatches.length > 0;

  return (
    <Composer>
      <ComposerMenu open={menuOpen} width="composer">
        {slashMatches.map((command, index) => (
          <ComposerCommandItem key={command.name} command={command} active={index === 0} />
        ))}
        {mentionMatches.map((person, index) => (
          <ComposerPersonItem
            key={person.name}
            person={person}
            active={index === 0}
            onClick={() => setText(applyMention(text, person.name))}
          />
        ))}
      </ComposerMenu>
      <ComposerBar>
        <ComposerInput
          value={text}
          onChange={(event) => setText(event.target.value)}
          onSubmit={() => setText("")}
          placeholder="Message Space Zero..."
        />
        <ComposerToolbar>
          <ComposerAttachButton />
          <ComposerActions>
            <ComposerContext usage={{ system: 8, tools: 12, messages: 42, total: 128 }} />
            <div className="relative">
              <ComposerModelTrigger
                model="Claude Sonnet"
                open={modelOpen}
                onClick={() => setModelOpen((open) => !open)}
              />
              <ComposerMenu open={modelOpen} align="end">
                {models.map((model, index) => (
                  <ComposerModelItem key={model.name} entry={model} selected={index === 0} />
                ))}
              </ComposerMenu>
            </div>
            <ComposerSend streaming={streaming} idle={!streaming && text.trim().length > 0} />
          </ComposerActions>
        </ComposerToolbar>
      </ComposerBar>
    </Composer>
  );
}

export const Default: Story = {
  render: () => <ControlledComposer />,
};

export const Streaming: Story = {
  render: () => <ControlledComposer streaming />,
};

export const WithAttachments: Story = {
  render: () => (
    <Composer>
      <ComposerBar>
        <ComposerAttachments>
          {attachments.map((attachment) => (
            <ComposerAttachmentChip key={attachment.name} attachment={attachment} />
          ))}
        </ComposerAttachments>
        <ComposerInput defaultValue="Use these files as context." placeholder="Message Space Zero..." />
        <ComposerToolbar>
          <ComposerAttachButton onClick={() => undefined} />
          <ComposerActions>
            <ComposerSend streaming={false} idle />
          </ComposerActions>
        </ComposerToolbar>
      </ComposerBar>
    </Composer>
  ),
};

export const VoiceInput: Story = {
  render: () => (
    <Composer>
      <ComposerBar>
        <ComposerVoice recording seconds={12} />
        <ComposerToolbar>
          <ComposerAttachButton />
          <ComposerActions>
            <ComposerVoiceButton active />
            <ComposerSend streaming={false} idle={false} />
          </ComposerActions>
        </ComposerToolbar>
      </ComposerBar>
    </Composer>
  ),
};
