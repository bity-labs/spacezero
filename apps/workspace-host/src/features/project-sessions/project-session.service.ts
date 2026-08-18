import { mkdir } from "node:fs/promises";
import type {
  CreateProjectSessionRequest,
  CreateProjectSessionResult,
  ListProjectSessionsResult,
  ProjectSessionErrorCode,
} from "@spacezero/host-contracts";
import {
  ProjectServiceError,
  createProjectAuthority,
} from "../projects/projects.service.js";
import { createManagedWorktree } from "./project-session-worktree.adapter.js";
import { ProjectSessionServiceError } from "./project-session.model.js";
import { createProjectSessionRepository } from "./project-session.repository.js";
import type { SessionNameEntropy } from "./project-session-name.service.js";

export interface ProjectSessionService {
  readonly create: (
    input: CreateProjectSessionRequest,
  ) => Promise<CreateProjectSessionResult>;
  readonly list: () => Promise<ListProjectSessionsResult>;
  readonly reconcile: () => Promise<void>;
  readonly waitForIdle: () => Promise<void>;
}

const mapProjectError = (
  error: ProjectServiceError,
): ProjectSessionErrorCode => {
  switch (error.code) {
    case "project_not_found":
      return "project_not_found";
    case "invalid_project_path":
    case "not_git_repository":
      return "project_repository_unavailable";
    case "repository_has_no_commit":
      return "source_revision_unavailable";
    case "repository_identity_mismatch":
      return "project_repository_identity_mismatch";
    case "command_id_conflict":
      return "command_id_conflict";
    case "project_catalog_unavailable":
      return "project_session_catalog_unavailable";
  }
};

const mapError = (error: unknown): ProjectSessionServiceError => {
  if (error instanceof ProjectSessionServiceError) return error;
  if (error instanceof ProjectServiceError)
    return new ProjectSessionServiceError(mapProjectError(error));
  return new ProjectSessionServiceError("project_session_catalog_unavailable");
};

export const createProjectSessionService = (options: {
  readonly databasePath: string;
  readonly spaceZeroHome: string;
  readonly entropy?: SessionNameEntropy;
}): ProjectSessionService => {
  const projectAuthority = createProjectAuthority(options.databasePath);
  const repository = createProjectSessionRepository(options);
  const locks = new Map<string, Promise<unknown>>();
  const inFlight = new Set<Promise<unknown>>();

  const withProjectLock = async <A>(
    projectId: string,
    run: () => Promise<A>,
  ) => {
    const previous = locks.get(projectId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(run);
    locks.set(projectId, current);
    try {
      return await current;
    } finally {
      if (locks.get(projectId) === current) locks.delete(projectId);
    }
  };

  const create = async (
    input: CreateProjectSessionRequest,
  ): Promise<CreateProjectSessionResult> =>
    withProjectLock(input.projectId, async () => {
      try {
        const project = await projectAuthority.authenticateProject(
          input.projectId,
        );
        const admission = await repository.replayOrAdmit(input, project);
        if (admission.kind === "replayed")
          return { session: admission.session };
        await mkdir(admission.worktreeRoot, { recursive: true });
        const operation = createManagedWorktree({
          project,
          worktreePath: admission.worktreePath,
          managedBranch: admission.session.managedBranch,
          sourceCommit: admission.session.sourceCommit,
        })
          .then((prepared) =>
            repository.markReady(
              input.commandId,
              admission.session.id,
              prepared,
            ),
          )
          .catch(() =>
            repository.markRecoveryRequired(
              input.commandId,
              admission.session.id,
            ),
          );
        inFlight.add(operation);
        operation.finally(() => inFlight.delete(operation));
        return await operation;
      } catch (error) {
        throw mapError(error);
      }
    });

  return {
    create,
    list: async () => ({ sessions: await repository.list() }),
    reconcile: async () => {
      const candidates = await repository.recoveryCandidates();
      await Promise.all(
        candidates.map(async (session) => {
          try {
            await repository.markExistingRecoveryRequired(session.id);
          } catch {
            // Individual Session reconciliation failures must not block Host startup.
          }
        }),
      );
    },
    waitForIdle: async () => {
      await Promise.allSettled([...inFlight]);
    },
  };
};
