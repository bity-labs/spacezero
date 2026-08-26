import type {
  ListProjectsResult,
  ProjectCatalogError,
  ProjectErrorCode,
  ProjectSummary,
  RegisterProjectRequest,
  RegisterProjectResult,
} from "@spacezero/host-contracts";

export interface InspectedRepository {
  readonly canonicalRootPath: string;
  readonly canonicalGitDirPath: string;
  readonly canonicalGitCommonDirPath: string;
  readonly rootDeviceId: string;
  readonly rootFileId: string;
  readonly commonDirDeviceId: string;
  readonly commonDirFileId: string;
  readonly objectsDirDeviceId: string;
  readonly objectsDirFileId: string;
  readonly headCommit: string;
  readonly displayName: string;
}

export interface AuthenticatedProjectRepository extends InspectedRepository {
  readonly projectId: string;
  readonly registeredHeadCommit: string;
  readonly sourceBranch: string | null;
  readonly sourceDetached: boolean;
  readonly dirty: boolean;
}

export interface ProjectCatalog {
  readonly register: (
    input: RegisterProjectRequest,
    signal?: AbortSignal,
  ) => Promise<RegisterProjectResult>;
  readonly list: () => Promise<ListProjectsResult>;
}

export interface ProjectRegistrationFailure {
  readonly code: ProjectErrorCode;
}

export type {
  ListProjectsResult,
  ProjectCatalogError,
  ProjectSummary,
  RegisterProjectRequest,
  RegisterProjectResult,
};
