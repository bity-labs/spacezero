import type {
  ProjectSessionErrorCode,
  ProjectSessionSummary,
} from "@spacezero/host-contracts";
import type { AuthenticatedProjectRepository } from "../projects/project.model.js";

export class ProjectSessionServiceError extends Error {
  constructor(readonly code: ProjectSessionErrorCode) {
    super(code);
  }
}

export interface ProjectSessionPaths {
  readonly worktreeRoot: string;
  readonly worktreePath: string;
  readonly managedBranch: string;
}

export interface ProjectSessionAdmission {
  readonly kind: "admitted" | "replayed";
  readonly session: ProjectSessionSummary;
  readonly worktreePath: string;
  readonly worktreeRoot: string;
  readonly project: AuthenticatedProjectRepository;
}

export interface PreparedWorktreeIdentity {
  readonly canonicalWorktreePath: string;
  readonly canonicalGitDirPath: string;
  readonly canonicalGitCommonDirPath: string;
  readonly worktreeDeviceId: string;
  readonly worktreeFileId: string;
  readonly gitDirDeviceId: string;
  readonly gitDirFileId: string;
  readonly commonDirDeviceId: string;
  readonly commonDirFileId: string;
}
