import { Button } from "@spacezero/ui/components/button";
import type { ProjectSessionSummary } from "@spacezero/host-contracts";
import type { ReactElement } from "react";

export interface ProjectSessionsListProps {
  readonly projectId: string;
  readonly sessions: readonly ProjectSessionSummary[];
  readonly creating: boolean;
  readonly onStartSession: (projectId: string) => void;
  readonly onOpenSession: (session: ProjectSessionSummary) => void;
}

const shortCommit = (commit: string): string => commit.slice(0, 8);

export const ProjectSessionsList = ({
  projectId,
  sessions,
  creating,
  onStartSession,
  onOpenSession,
}: ProjectSessionsListProps): ReactElement => (
  <div className="project-sessions">
    <Button
      type="button"
      onClick={() => onStartSession(projectId)}
      disabled={creating}
      size="sm"
    >
      {creating ? "Starting…" : "Start Session"}
    </Button>
    {sessions.length === 0 ? <p>No Sessions yet.</p> : null}
    <ul className="project-sessions__list" aria-label="Project Sessions">
      {sessions.map((session) => (
        <li key={session.id} className="project-sessions__item">
          <div className="project-sessions__item-header">
            <strong>{session.name}</strong>
            {session.state === "ready" ? (
              <Button
                type="button"
                onClick={() => onOpenSession(session)}
                size="sm"
              >
                Open Chat
              </Button>
            ) : null}
          </div>
          <span>{session.state.replaceAll("_", " ")}</span>
          <span>
            {session.sourceDetached
              ? "detached HEAD"
              : (session.sourceBranch ?? "unknown branch")}{" "}
            @ {shortCommit(session.sourceCommit)}
          </span>
          {session.uncommittedChangesExcluded ? (
            <p role="alert" className="project-sessions__warning">
              This Session used committed HEAD and excluded uncommitted base
              checkout changes.
            </p>
          ) : null}
          {session.state === "recovery_required" ? (
            <p role="alert" className="project-sessions__warning">
              This Session needs recovery before it can be used.
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  </div>
);
