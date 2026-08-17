import { createProjectCatalogClient } from "@spacezero/client-runtime";
import type { ProjectCatalogError } from "@spacezero/host-contracts";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from "react";
import { ProjectsView, type ProjectsViewState } from "./projects-view.js";

const isProjectCatalogError = (error: unknown): error is ProjectCatalogError =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  "message" in error &&
  typeof (error as { readonly code?: unknown }).code === "string" &&
  typeof (error as { readonly message?: unknown }).message === "string";

export const ProjectsContainer = (): ReactElement => {
  const [state, setState] = useState<ProjectsViewState>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const client = useMemo(
    () =>
      createProjectCatalogClient({
        getConnectionDescriptor: window.spacezero.getLocalHostConnection,
      }),
    [],
  );
  const load = useCallback(async () => {
    try {
      const projects = await client.listProjects();
      setState(
        projects.length === 0
          ? { status: "empty" }
          : { status: "ready", projects },
      );
    } catch {
      setState({
        status: "error",
        message: "Project catalog is unavailable. Try again.",
      });
    }
  }, [client]);
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
        await client.registerProject(selection.path);
        await load();
      }
    } catch (error) {
      setState({
        status: "error",
        message: isProjectCatalogError(error)
          ? error.message
          : "Project could not be registered. Try again.",
      });
    } finally {
      setBusy(false);
    }
  }, [client, load]);
  return <ProjectsView state={state} busy={busy} onAddProject={addProject} />;
};
