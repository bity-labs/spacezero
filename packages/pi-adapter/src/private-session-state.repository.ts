import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type PiPrivateStateStatus =
  | "ready"
  | "operation_started"
  | "operation_settled"
  | "missing"
  | "corrupt"
  | "version_mismatch";

export interface PiPrivateTurnBoundary {
  readonly operationId: string;
  readonly turnId: string;
  readonly prompt: string;
  readonly assistantText?: string;
  readonly settledAt?: string;
}

export interface PiPrivateSessionState {
  readonly id: string;
  readonly version: 1;
  readonly conversationId: string;
  readonly status: PiPrivateStateStatus;
  readonly openOperationId?: string;
  readonly lastSettledOperationId?: string;
  readonly turns: readonly PiPrivateTurnBoundary[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export class PiPrivateStateError extends Error {
  constructor(readonly code: "missing" | "corrupt" | "version_mismatch") {
    super(code);
  }
}

export interface PiPrivateSessionStateRepository {
  readonly read: (id: string) => Promise<PiPrivateSessionState | undefined>;
  readonly create: (input: {
    readonly id: string;
    readonly conversationId: string;
  }) => Promise<PiPrivateSessionState>;
  readonly open: (id: string) => Promise<PiPrivateSessionState>;
  readonly recordOperationStarted: (input: {
    readonly id: string;
    readonly operationId: string;
    readonly turnId: string;
    readonly prompt: string;
  }) => Promise<PiPrivateSessionState>;
  readonly recordOperationSettled: (input: {
    readonly id: string;
    readonly operationId: string;
    readonly assistantText: string;
  }) => Promise<PiPrivateSessionState>;
  readonly reconcile: (id: string) => Promise<PiPrivateStateStatus>;
  readonly delete: (id: string) => Promise<void>;
}

const statePath = (directory: string, id: string): string =>
  join(directory, `${id}.json`);

const parseState = (value: unknown): PiPrivateSessionState => {
  if (!value || typeof value !== "object")
    throw new PiPrivateStateError("corrupt");
  const state = value as Partial<PiPrivateSessionState>;
  if (state.version !== 1) throw new PiPrivateStateError("version_mismatch");
  if (
    typeof state.id !== "string" ||
    typeof state.conversationId !== "string" ||
    typeof state.status !== "string" ||
    !Array.isArray(state.turns) ||
    typeof state.createdAt !== "string" ||
    typeof state.updatedAt !== "string"
  )
    throw new PiPrivateStateError("corrupt");
  return state as PiPrivateSessionState;
};

export const createPiPrivateSessionStateRepository = (input: {
  readonly directory: string;
}): PiPrivateSessionStateRepository => {
  const directory = input.directory;
  const readState = async (id: string): Promise<PiPrivateSessionState> => {
    try {
      return parseState(
        JSON.parse(await readFile(statePath(directory, id), "utf8")),
      );
    } catch (error) {
      if (error instanceof PiPrivateStateError) throw error;
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      )
        throw new PiPrivateStateError("missing");
      throw new PiPrivateStateError("corrupt");
    }
  };
  const writeState = async (
    state: PiPrivateSessionState,
  ): Promise<PiPrivateSessionState> => {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const target = statePath(directory, state.id);
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
    await rename(temporary, target);
    return state;
  };

  return {
    create: async ({ id, conversationId }) => {
      const now = new Date().toISOString();
      return writeState({
        id,
        version: 1,
        conversationId,
        status: "ready",
        turns: [],
        createdAt: now,
        updatedAt: now,
      });
    },
    read: readState,
    open: readState,
    recordOperationStarted: async ({ id, operationId, turnId, prompt }) => {
      const state = await readState(id);
      const now = new Date().toISOString();
      return writeState({
        ...state,
        status: "operation_started",
        openOperationId: operationId,
        turns: [...state.turns, { operationId, turnId, prompt }].slice(-200),
        updatedAt: now,
      });
    },
    recordOperationSettled: async ({ id, operationId, assistantText }) => {
      const state = await readState(id);
      const now = new Date().toISOString();
      return writeState({
        id: state.id,
        version: state.version,
        conversationId: state.conversationId,
        createdAt: state.createdAt,
        status: "operation_settled",
        lastSettledOperationId: operationId,
        turns: state.turns.map((turn) =>
          turn.operationId === operationId
            ? { ...turn, assistantText, settledAt: now }
            : turn,
        ),
        updatedAt: now,
      });
    },
    reconcile: async (id) => {
      try {
        const state = await readState(id);
        return state.openOperationId ? "operation_started" : state.status;
      } catch (error) {
        if (error instanceof PiPrivateStateError) return error.code;
        return "corrupt";
      }
    },
    delete: async (id) => {
      await rm(statePath(directory, id), { force: true });
    },
  };
};
