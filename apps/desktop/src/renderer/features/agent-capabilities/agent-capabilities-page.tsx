import {
  CaretRight,
  FlowArrow,
  Plugs,
  Plus,
  Robot,
  SlidersHorizontal,
  Sparkle,
} from "@phosphor-icons/react";
import { Button } from "@spacezero/ui/components/button";
import { Card } from "@spacezero/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@spacezero/ui/components/dialog";
import { Heading, Text } from "@spacezero/ui/components/typography";
import { cn } from "@spacezero/ui/lib/utils";
import { useState, type ComponentType, type ReactElement } from "react";

import {
  AgentCapabilityConfigSelect,
  type AgentCapabilityConfigScope,
} from "./components/agent-capability-config-select";
import {
  AgentCapabilityRow,
  type AgentCapabilityScope,
} from "./components/agent-capability-row";
import { AgentCapabilitiesSearch } from "./components/agent-capabilities-search";

type CapabilityTabId = "skills" | "subagents" | "workflows" | "mcp";

type CapabilityTab = {
  id: CapabilityTabId;
  label: string;
};

type CapabilityItem = {
  id: string;
  name: string;
  scope: AgentCapabilityScope;
  description: string;
  path?: string;
  enabled: boolean;
  disabled?: boolean;
};

const capabilityTabs: CapabilityTab[] = [
  { id: "skills", label: "Skills" },
  { id: "subagents", label: "Subagents" },
  { id: "workflows", label: "Workflows" },
  { id: "mcp", label: "MCP" },
];

const capabilityItemsByTab: Record<CapabilityTabId, CapabilityItem[]> = {
  skills: [
    {
      id: "ai-elements",
      name: "ai-elements",
      scope: "User",
      description:
        "Build AI chat interfaces using ai-elements components — conversations, messages, tool displays, prompt inputs, and more.",
      path: "~/.agents/skills/ai-elements/SKILL.md",
      enabled: true,
    },
    {
      id: "code-review",
      name: "code-review",
      scope: "User",
      description:
        "Review a GitHub pull request when a review pass is explicitly requested.",
      path: "<project>/.agents/skills/code-review/SKILL.md",
      enabled: true,
    },
    {
      id: "implement-with-tdd",
      name: "implement-with-tdd",
      scope: "Project",
      description:
        "Implement clear behavior through a disciplined red-green-refactor loop.",
      path: "<project>/.agents/skills/implement-with-tdd/SKILL.md",
      enabled: true,
    },
  ],
  subagents: [
    {
      id: "reviewer",
      name: "reviewer",
      scope: "Built-in",
      description:
        "Run an independent read-only review of implementation plans, code changes, and residual risks.",
      enabled: true,
    },
    {
      id: "researcher",
      name: "researcher",
      scope: "Built-in",
      description:
        "Collect focused context and evidence before the main agent decides what to change.",
      enabled: true,
    },
    {
      id: "validator",
      name: "validator",
      scope: "Planned",
      description:
        "Validate completed work against acceptance criteria and project rules.",
      enabled: false,
      disabled: true,
    },
  ],
  workflows: [
    {
      id: "tdd-implementation",
      name: "TDD implementation",
      scope: "Project",
      description:
        "Start from a clear behavior, write the failing test, implement the slice, then refactor safely.",
      enabled: true,
    },
    {
      id: "prd-to-issues",
      name: "PRD to issues",
      scope: "Project",
      description:
        "Break a PRD or plan into independently grabbable vertical-slice GitHub issues.",
      enabled: true,
    },
    {
      id: "release-check",
      name: "Release check",
      scope: "Planned",
      description:
        "Run pre-release validation, summarize risk, and prepare publish notes.",
      enabled: false,
      disabled: true,
    },
  ],
  mcp: [
    {
      id: "github-mcp",
      name: "GitHub MCP",
      scope: "Planned",
      description:
        "Connect GitHub context through an MCP server when external tool connections are introduced.",
      enabled: false,
      disabled: true,
    },
    {
      id: "browser-mcp",
      name: "Browser MCP",
      scope: "Planned",
      description:
        "Expose browser automation and debugging context through a controlled MCP connection.",
      enabled: false,
      disabled: true,
    },
  ],
};

export function AgentCapabilitiesPage(): ReactElement {
  const [selectedTab, setSelectedTab] = useState<CapabilityTabId>("skills");
  const [configScope, setConfigScope] =
    useState<AgentCapabilityConfigScope>("global");
  const [isCreateDialogOpen, setCreateDialogOpen] = useState(false);
  const [isManaging, setManaging] = useState(false);
  const selectedItems = capabilityItemsByTab[selectedTab];
  const selectedLabel =
    capabilityTabs.find((tab) => tab.id === selectedTab)?.label ??
    "Capabilities";

  return (
    <section className="min-h-0 flex-1 overflow-auto">
      <header className="flex items-start justify-between gap-6 px-8 pb-8 pt-10">
        <div className="flex max-w-3xl flex-col gap-2">
          <Heading as="h1" level="h1">
            Agent Capabilities
          </Heading>
          <Text variant="muted">
            Configure the reusable skills, subagents, workflows, and tool
            connections that extend agent work in Space Zero.
          </Text>
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            aria-pressed={isManaging}
            onClick={() => setManaging((editing) => !editing)}
          >
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            Manage
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={() => setCreateDialogOpen(true)}
          >
            <Plus className="size-4" aria-hidden="true" />
            Add
          </Button>
        </div>
      </header>

      <div className="flex items-end justify-between gap-6 border-b border-border px-8">
        <CapabilityTabs
          selectedTab={selectedTab}
          onSelectTab={setSelectedTab}
        />
        <div className="pb-3">
          <AgentCapabilityConfigSelect
            value={configScope}
            onValueChange={setConfigScope}
          />
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-8 py-10">
        <Card className="gap-0 py-0">
          <AgentCapabilitiesSearch
            label={`Search ${selectedLabel.toLowerCase()}`}
            placeholder={`Search ${selectedLabel.toLowerCase()} by name...`}
          />
          <div>
            {selectedItems.map((item) => (
              <AgentCapabilityRow
                key={item.id}
                {...item}
                editing={isManaging}
              />
            ))}
          </div>
        </Card>
      </div>

      <CreateCapabilityDialog
        open={isCreateDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </section>
  );
}

function CapabilityTabs({
  selectedTab,
  onSelectTab,
}: {
  selectedTab: CapabilityTabId;
  onSelectTab: (tab: CapabilityTabId) => void;
}): ReactElement {
  return (
    <div role="tablist" aria-label="Agent capability categories">
      <div className="flex gap-8 px-1">
        {capabilityTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selectedTab === tab.id}
            className={cn(
              "relative -mb-px py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              selectedTab === tab.id
                ? "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-foreground"
                : null,
            )}
            onClick={() => onSelectTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CreateCapabilityDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add capability</DialogTitle>
          <DialogDescription>
            Choose the type of agent capability to create.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <CreateCapabilityMenuItem
            icon={Sparkle}
            title="Create a new skill"
            description="Add a reusable SKILL.md capability for agent workflows."
          />
          <CreateCapabilityMenuItem
            icon={Robot}
            title="Create a new subagent"
            description="Define a named helper agent for delegated work."
          />
          <CreateCapabilityMenuItem
            icon={FlowArrow}
            title="Create a new workflow"
            description="Compose repeatable steps across agents, skills, and tools."
          />
          <CreateCapabilityMenuItem
            icon={Plugs}
            title="Connect an MCP server"
            description="Prepare an external Model Context Protocol tool connection."
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateCapabilityMenuItem({
  icon: Icon,
  title,
  description,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
}): ReactElement {
  return (
    <Button
      type="button"
      variant="outline"
      aria-label={title}
      className="h-auto w-full min-w-0 justify-start gap-4 rounded-xl p-4 text-left whitespace-normal"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <Text as="span" variant="label" className="block text-sm leading-5">
          {title}
        </Text>
        <Text as="span" variant="subtle" className="mt-1 block leading-4">
          {description}
        </Text>
      </span>
      <CaretRight
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </Button>
  );
}
