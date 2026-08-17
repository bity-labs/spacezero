import type { ProjectSummary } from "@spacezero/host-contracts";
import type { ReactElement } from "react";

export type ProjectsViewState =
  | { readonly status: "loading" }
  | { readonly status: "empty" }
  | { readonly status: "ready"; readonly projects: readonly ProjectSummary[] }
  | { readonly status: "error"; readonly message: string };

export interface ProjectsViewProps {
  readonly state: ProjectsViewState;
  readonly busy: boolean;
  readonly onAddProject: () => void;
}

export const ProjectsView = ({
  state,
  busy,
  onAddProject,
}: ProjectsViewProps): ReactElement => (
  <section className="projects" aria-labelledby="projects-title">
    <div className="projects__header">
      <div>
        <p className="eyebrow">Host-owned Project catalog</p>
        <h2 id="projects-title">Projects</h2>
      </div>
      <button type="button" onClick={onAddProject} disabled={busy}>
        {busy ? "Adding…" : "Add Project"}
      </button>
    </div>
    {state.status === "loading" ? <p role="status">Loading Projects…</p> : null}
    {state.status === "empty" ? (
      <p>No Projects registered on this Host yet.</p>
    ) : null}
    {state.status === "error" ? (
      <p role="alert">
        {state.message || "Project catalog is unavailable. Try again."}
      </p>
    ) : null}
    {state.status === "ready" ? (
      <ul className="projects__list">
        {state.projects.map((project) => (
          <li key={project.id}>
            <strong>{project.displayName}</strong>
            <span>{project.canonicalPath}</span>
          </li>
        ))}
      </ul>
    ) : null}
  </section>
);
