import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
} from "@spacezero/ui";

const meta = {
  title: "Design System/Primitives/Dialog",
  component: Dialog,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Prompt: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Open dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create project</DialogTitle>
          <DialogDescription>
            Name the workspace project that Space Zero should track.
          </DialogDescription>
        </DialogHeader>
        <Input aria-label="Project name" placeholder="spacezero" />
        <DialogFooter>
          <Button variant="outline">Cancel</Button>
          <Button>Create project</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const Open: Story = {
  render: () => (
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agent needs confirmation</DialogTitle>
          <DialogDescription>
            Review the requested action before the session continues.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border bg-muted p-3 text-sm text-muted-foreground">
          Run validation checks for the UI package.
        </div>
        <DialogFooter>
          <Button variant="outline">Deny</Button>
          <Button>Approve</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};
