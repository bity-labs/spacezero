import {
  createProjectCatalogClient,
  createProjectSessionClient,
} from "@spacezero/client-runtime";
import type {
  ProjectCatalogError,
  ProjectSessionError,
} from "@spacezero/host-contracts";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from "react";
import { ProjectsView, type ProjectsViewState } from "./projects-view.js";

const isPublicHostError = (
  error: unknown,
): error is ProjectCatalogError | ProjectSessionError =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  "message" in error &&
  typeof (error as { readonly code?: unknown }).code === "string" &&
  typeof (error as { readonly message?: unknown }).message === "string";

export const ProjectsContainer = (): ReactElement => {
  const [state, setState] = useState<ProjectsViewState>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [creatingProjectId, setCreatingProjectId] = useState<string | null>(
    null,
  );
  const clients = useMemo(
    () => ({
      projects: createProjectCatalogClient({
        getConnectionDescriptor: window.spacezero.getLocalHostConnection,
      }),
      sessions: createProjectSessionClient({
        getConnectionDescriptor: window.spacezero.getLocalHostConnection,
      }),
    }),
    [],
  );
  const load = useCallback(async () => {
    try {
      const [projects, sessions] = await Promise.all([
        clients.projects.listProjects(),
        clients.sessions.listProjectSessions(),
      ]);
      setState(
        projects.length === 0
          ? { status: "empty" }
          : { status: "ready", projects, sessions },
      );
    } catch {
      setState({
        status: "error",
        message: "Project catalog is unavailable. Try again.",
      });
    }
  }, [clients]);
  useEffect(() => {
    const task = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(task);
  }, [load]);
  const addProject = useCallback(async () => {
    setBusy(true);
    try {
      const selection = await window.spacezero.selectProjectFolder();
      if (selection.status === "selected") {
        await clients.projects.registerProject(selection.path);
        await load();
      }
    } catch (error) {
      setState({
        status: "error",
        message: isPublicHostError(error)
          ? error.message
          : "Project could not be registered. Try again.",
      });
    } finally {
      setBusy(false);
    }
  }, [clients, load]);
  const startSession = useCallback(
    async (projectId: string) => {
      setCreatingProjectId(projectId);
      try {
        await clients.sessions.createProjectSession(projectId);
        await load();
      } catch (error) {
        setState({
          status: "error",
          message: isPublicHostError(error)
            ? error.message
            : "Project Session could not be started. Try again.",
        });
      } finally {
        setCreatingProjectId(null);
      }
    },
    [clients, load],
  );
  return (
    <ProjectsView
      state={state}
      busy={busy}
      creatingProjectId={creatingProjectId}
      onAddProject={addProject}
      onStartSession={startSession}
    />
  );
};
