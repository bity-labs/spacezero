import {
  BookOpenText,
  CaretDownIcon,
  FolderPlus,
  FunnelSimple,
  GearSix,
  PaperPlaneTilt,
  Plugs,
  User,
} from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@spacezero/ui/components/sidebar";

type NavView = "knowledge-base" | "global-chat" | "agent-capabilities";

const projects = ["Space Zero", "Launchpad", "Knowledge Garden", "Agent Bench"];

const meta: Meta = {
  title: "Design System/Primitives/Sidebar",
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Composition mirroring the main-screen workspace sidebar: primary navigation,
 * a collapsible Projects group, and the account footer.
 */
function WorkspaceSidebarFixture({
  initialView = "workspace" as NavView | "workspace",
  initialProjectsExpanded = true,
}: {
  readonly initialView?: NavView | "workspace";
  readonly initialProjectsExpanded?: boolean;
}) {
  const [activeView, setActiveView] = useState<NavView | "workspace">(
    initialView,
  );
  const [projectsExpanded, setProjectsExpanded] = useState(
    initialProjectsExpanded,
  );
  const [selectedProject, setSelectedProject] = useState<string | null>(
    initialView === "workspace" ? "Space Zero" : null,
  );
  const navItems: readonly {
    readonly view: NavView;
    readonly label: string;
    readonly Icon: typeof BookOpenText;
  }[] = [
    { view: "knowledge-base", label: "Knowledge Base", Icon: BookOpenText },
    { view: "global-chat", label: "Chat", Icon: PaperPlaneTilt },
    { view: "agent-capabilities", label: "Agent Capabilities", Icon: Plugs },
  ];

  return (
    <div className="flex h-[36rem] w-[44rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border bg-background">
      <SidebarProvider className="min-h-0 w-full flex-1 overflow-hidden">
        <Sidebar
          collapsible="none"
          side="left"
          className="min-h-0 w-64 flex-1 overflow-hidden"
        >
          <SidebarHeader>
            <SidebarMenu aria-label="Workspace navigation">
              {navItems.map(({ view, label, Icon }) => (
                <SidebarMenuItem key={view}>
                  <SidebarMenuButton
                    isActive={activeView === view}
                    onClick={() => {
                      setActiveView(view);
                      setSelectedProject(null);
                    }}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent className="overflow-hidden px-0 pb-3">
            <SidebarGroup className="mt-6 min-h-0 flex-1 overflow-hidden">
              <div className="flex items-center justify-between px-2 pb-1">
                <button
                  type="button"
                  className="flex items-center gap-1 rounded px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                  aria-expanded={projectsExpanded}
                  onClick={() => {
                    setProjectsExpanded((expanded) => !expanded);
                  }}
                >
                  <CaretDownIcon
                    className={`size-3 transition-transform ${projectsExpanded ? "" : "-rotate-90"}`}
                    aria-hidden="true"
                  />
                  Projects
                </button>
                <span className="flex items-center gap-0.5">
                  <button
                    type="button"
                    aria-label="Filter projects"
                    className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <FunnelSimple className="size-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Add project"
                    className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <FolderPlus className="size-3.5" aria-hidden="true" />
                  </button>
                </span>
              </div>
              {projectsExpanded ? (
                <div className="min-h-0 flex-1 overflow-auto px-2">
                  <SidebarMenu>
                    {projects.map((project) => (
                      <SidebarMenuItem key={project}>
                        <SidebarMenuButton
                          isActive={
                            activeView === "workspace" &&
                            selectedProject === project
                          }
                          onClick={() => {
                            setActiveView("workspace");
                            setSelectedProject(project);
                          }}
                        >
                          <span>{project}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </div>
              ) : null}
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <section
              className="flex items-center gap-2 rounded-lg px-1 py-1"
              aria-label="Account menu"
            >
              <div className="bg-muted text-muted-foreground flex size-8 items-center justify-center rounded-full">
                <User className="size-4" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-muted-foreground truncate text-sm leading-5">
                  Not connected
                </span>
              </div>
              <button
                type="button"
                aria-label="Open app settings"
                className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-1"
              >
                <GearSix className="size-5" aria-hidden="true" />
              </button>
            </section>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <div className="flex items-center gap-2 p-3">
            <SidebarTrigger />
            <span className="text-muted-foreground text-sm">
              Workspace content
            </span>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}

export const MainScreen: Story = {
  render: () => <WorkspaceSidebarFixture />,
};

export const ProjectsCollapsed: Story = {
  render: () => <WorkspaceSidebarFixture initialProjectsExpanded={false} />,
};

export const ChatActive: Story = {
  render: () => <WorkspaceSidebarFixture initialView="global-chat" />,
};
