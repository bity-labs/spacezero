import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectsContainer } from "./projects-container.js";

const projectClient = vi.hoisted(() => ({
  listProjects: vi.fn(),
  registerProject: vi.fn(),
}));
const sessionClient = vi.hoisted(() => ({
  listProjectSessions: vi.fn(),
  createProjectSession: vi.fn(),
}));

vi.mock("@spacezero/client-runtime", () => ({
  createProjectCatalogClient: () => projectClient,
  createProjectSessionClient: () => sessionClient,
}));

const spacezero = (selection: unknown) => {
  Object.defineProperty(window, "spacezero", {
    value: {
      getLocalHostConnection: vi.fn(),
      selectProjectFolder: vi.fn().mockResolvedValue(selection),
    },
    configurable: true,
  });
  return window.spacezero;
};

describe("ProjectsContainer", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens the Session chat for a ready Session", async () => {
    spacezero({ status: "cancelled" });
    const onOpenSession = vi.fn();
    const session = {
      id: "22222222-2222-4222-8222-222222222222",
      projectId: "11111111-1111-4111-8111-111111111111",
      name: "margaux",
      state: "ready" as const,
      sourceBranch: "main",
      sourceDetached: false,
      sourceCommit: "a".repeat(40),
      uncommittedChangesExcluded: false,
      managedBranch: "spacezero/margaux-22222222-2222-4222-8222-222222222222",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      lastSequence: 4,
    };
    sessionClient.listProjectSessions.mockResolvedValue([session]);
    projectClient.listProjects.mockResolvedValue([
      {
        id: "11111111-1111-4111-8111-111111111111",
        displayName: "repo",
        canonicalPath: "/repo",
        registeredHeadCommit: "a".repeat(40),
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    render(<ProjectsContainer onOpenSession={onOpenSession} />);
    fireEvent.click(await screen.findByRole("button", { name: "Open Chat" }));

    expect(onOpenSession).toHaveBeenCalledWith(session);
  });

  it("lists Projects from Client Runtime", async () => {
    spacezero({ status: "cancelled" });
    sessionClient.listProjectSessions.mockResolvedValue([]);
    projectClient.listProjects.mockResolvedValue([
      {
        id: "11111111-1111-4111-8111-111111111111",
        displayName: "repo",
        canonicalPath: "/repo",
        registeredHeadCommit: "a".repeat(40),
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    render(<ProjectsContainer onOpenSession={vi.fn()} />);

    expect(await screen.findByText("repo")).toBeInTheDocument();
    expect(screen.getByText("/repo")).toBeInTheDocument();
  });

  it("adds a selected Project and reloads the list", async () => {
    const api = spacezero({ status: "selected", path: "/repo" });
    sessionClient.listProjectSessions.mockResolvedValue([]);
    projectClient.listProjects.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: "11111111-1111-4111-8111-111111111111",
        displayName: "repo",
        canonicalPath: "/repo",
        registeredHeadCommit: "a".repeat(40),
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    projectClient.registerProject.mockResolvedValue({ outcome: "registered" });

    render(<ProjectsContainer onOpenSession={vi.fn()} />);
    await screen.findByText("No Projects registered on this Host yet.");
    fireEvent.click(screen.getByRole("button", { name: "Add Project" }));

    await waitFor(() =>
      expect(projectClient.registerProject).toHaveBeenCalledWith("/repo"),
    );
    expect(api.selectProjectFolder).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("repo")).toBeInTheDocument();
  });

  it("leaves state unchanged when folder selection is cancelled", async () => {
    spacezero({ status: "cancelled" });
    sessionClient.listProjectSessions.mockResolvedValue([]);
    sessionClient.listProjectSessions.mockResolvedValue([]);
    projectClient.listProjects.mockResolvedValue([]);

    render(<ProjectsContainer onOpenSession={vi.fn()} />);
    await screen.findByText("No Projects registered on this Host yet.");
    fireEvent.click(screen.getByRole("button", { name: "Add Project" }));

    await waitFor(() =>
      expect(projectClient.registerProject).not.toHaveBeenCalled(),
    );
    expect(
      screen.getByText("No Projects registered on this Host yet."),
    ).toBeInTheDocument();
  });

  it("shows typed Project errors and safe fallback errors", async () => {
    spacezero({ status: "selected", path: "/repo" });
    sessionClient.listProjectSessions.mockResolvedValue([]);
    sessionClient.listProjectSessions.mockResolvedValue([]);
    projectClient.listProjects.mockResolvedValue([]);
    projectClient.registerProject.mockRejectedValueOnce({
      code: "repository_identity_mismatch",
      message:
        "The repository at this location no longer matches the registered Project.",
    });

    const { unmount } = render(<ProjectsContainer onOpenSession={vi.fn()} />);
    await screen.findByText("No Projects registered on this Host yet.");
    fireEvent.click(screen.getByRole("button", { name: "Add Project" }));
    expect(
      await screen.findByText(
        "The repository at this location no longer matches the registered Project.",
      ),
    ).toBeInTheDocument();
    unmount();

    spacezero({ status: "selected", path: "/repo" });
    sessionClient.listProjectSessions.mockResolvedValue([]);
    sessionClient.listProjectSessions.mockResolvedValue([]);
    projectClient.listProjects.mockResolvedValue([]);
    projectClient.registerProject.mockRejectedValueOnce(new Error("boom"));
    render(<ProjectsContainer onOpenSession={vi.fn()} />);
    await screen.findByText("No Projects registered on this Host yet.");
    fireEvent.click(screen.getByRole("button", { name: "Add Project" }));
    expect(
      await screen.findByText("Project could not be registered. Try again."),
    ).toBeInTheDocument();
  });
});
