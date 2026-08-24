/**
 * Pi SDK-backed ConversationRunner implementation.
 *
 * Creates a Pi Agent for each submitted turn, but seeds it with the stable
 * Project Session conversation id and the durable Space Zero message history for
 * that one Session. Tool execution is explicitly configured with a bounded
 * filesystem rooted at the authenticated managed worktree.
 */
import { realpathSync } from "node:fs";
import { access, lstat, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import {
  Agent,
  createEditTool,
  createReadTool,
  createWriteTool,
  err,
  FileError,
  NodeExecutionEnv,
  type AgentEvent,
  type AgentHarnessTool,
  type AgentMessage,
  type AgentTool,
  type ExecutionEnv,
  type ExecutionToolContext,
  type FileInfo,
  type Result,
} from "@earendil-works/pi-agent-core/node";
import type {
  AssistantMessage,
  AuthContext,
  CredentialStore,
  Models,
} from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import {
  AgentTurnError,
  type AgentTurnInput,
  type AgentTurnResult,
  type ConversationRunner,
} from "./conversation.model.js";

export interface PiConversationConfig {
  /** Provider id, e.g. "anthropic" */
  provider: string;
  /** Model id within the provider, e.g. "claude-sonnet-4-20250514" */
  model: string;
  /** Host-private credential storage owned by the Pi Adapter boundary. */
  credentials: CredentialStore;
  /** Optional system prompt */
  systemPrompt?: string;
  /** Explicit auth context; defaults to denying ambient env/file credentials. */
  authContext?: AuthContext;
  /** Test seam for deterministic Models implementations. */
  models?: Models;
}

const noAmbientAuthContext: AuthContext = {
  env: async () => undefined,
  fileExists: async () => false,
};

const zeroUsage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
  },
};

const restoredAssistantMessage = (text: string): AssistantMessage => ({
  role: "assistant",
  content: [{ type: "text", text }],
  api: "pi-messages",
  provider: "spacezero",
  model: "spacezero-restored-session-message",
  usage: zeroUsage,
  stopReason: "stop",
  timestamp: Date.now(),
});

const toAgentMessage = (
  message: AgentTurnInput["history"][number],
): AgentMessage => {
  if (message.role === "user")
    return { role: "user", content: message.text, timestamp: Date.now() };
  return restoredAssistantMessage(message.text);
};

class BoundedExecutionEnv extends NodeExecutionEnv implements ExecutionEnv {
  readonly #root: string;

  constructor(root: string) {
    const canonical = realpathSync(root);
    super({ cwd: canonical });
    this.#root = canonical;
  }

  #permissionDenied(path: string): Result<never, FileError> {
    return err(
      new FileError(
        "permission_denied",
        "Path is outside the authenticated managed worktree",
        path,
      ),
    );
  }

  #withinRoot(candidate: string): boolean {
    const rel = relative(this.#root, candidate);
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  }

  #boundedLexical(path: string): Result<string, FileError> {
    if (path.includes("\0")) return this.#permissionDenied(path);
    const candidate = isAbsolute(path)
      ? resolve(path)
      : resolve(this.#root, path);
    if (this.#withinRoot(candidate)) return { ok: true, value: candidate };
    return this.#permissionDenied(path);
  }

  async #boundedExisting(path: string): Promise<Result<string, FileError>> {
    const candidate = this.#boundedLexical(path);
    if (!candidate.ok) return candidate;
    try {
      const canonical = await realpath(candidate.value);
      if (this.#withinRoot(canonical)) return { ok: true, value: canonical };
    } catch {
      return candidate;
    }
    return this.#permissionDenied(path);
  }

  async #boundedForCreate(path: string): Promise<Result<string, FileError>> {
    const candidate = this.#boundedLexical(path);
    if (!candidate.ok) return candidate;
    try {
      const canonical = await realpath(candidate.value);
      if (this.#withinRoot(canonical)) return { ok: true, value: canonical };
      return this.#permissionDenied(path);
    } catch {
      try {
        const info = await lstat(candidate.value);
        if (info.isSymbolicLink()) return this.#permissionDenied(path);
      } catch {
        // The target may be new. Resolve the nearest existing ancestor so an
        // in-worktree symlinked directory cannot redirect creation outside root.
      }
    }

    let ancestor = dirname(candidate.value);
    for (;;) {
      try {
        await access(ancestor);
        const canonicalAncestor = await realpath(ancestor);
        if (!this.#withinRoot(canonicalAncestor))
          return this.#permissionDenied(path);
        return { ok: true, value: candidate.value };
      } catch {
        const parent = dirname(ancestor);
        if (parent === ancestor || !this.#withinRoot(parent))
          return this.#permissionDenied(path);
        ancestor = parent;
      }
    }
  }

  override async absolutePath(
    path: string,
  ): Promise<Result<string, FileError>> {
    return this.#boundedLexical(path);
  }

  override async joinPath(parts: string[]): Promise<Result<string, FileError>> {
    return this.#boundedLexical(resolve(this.#root, ...parts));
  }

  override async readTextFile(
    path: string,
    abortSignal?: AbortSignal,
  ): Promise<Result<string, FileError>> {
    const bounded = await this.#boundedExisting(path);
    return bounded.ok
      ? super.readTextFile(bounded.value, abortSignal)
      : bounded;
  }

  override async readTextLines(
    path: string,
    options?: { maxLines?: number; abortSignal?: AbortSignal },
  ): Promise<Result<string[], FileError>> {
    const bounded = await this.#boundedExisting(path);
    return bounded.ok ? super.readTextLines(bounded.value, options) : bounded;
  }

  override async readBinaryFile(
    path: string,
    abortSignal?: AbortSignal,
  ): Promise<Result<Uint8Array, FileError>> {
    const bounded = await this.#boundedExisting(path);
    return bounded.ok
      ? super.readBinaryFile(bounded.value, abortSignal)
      : bounded;
  }

  override async writeFile(
    path: string,
    content: string | Uint8Array,
    abortSignal?: AbortSignal,
  ): Promise<Result<void, FileError>> {
    const bounded = await this.#boundedForCreate(path);
    return bounded.ok
      ? super.writeFile(bounded.value, content, abortSignal)
      : bounded;
  }

  override async appendFile(
    path: string,
    content: string | Uint8Array,
  ): Promise<Result<void, FileError>> {
    const bounded = await this.#boundedForCreate(path);
    return bounded.ok ? super.appendFile(bounded.value, content) : bounded;
  }

  override async renameFile(
    sourcePath: string,
    destinationPath: string,
    abortSignal?: AbortSignal,
  ): Promise<Result<void, FileError>> {
    const source = await this.#boundedExisting(sourcePath);
    if (!source.ok) return source;
    const destination = await this.#boundedForCreate(destinationPath);
    return destination.ok
      ? super.renameFile(source.value, destination.value, abortSignal)
      : destination;
  }

  override async fileInfo(path: string): Promise<Result<FileInfo, FileError>> {
    const bounded = await this.#boundedExisting(path);
    return bounded.ok ? super.fileInfo(bounded.value) : bounded;
  }

  override async listDir(
    path: string,
    abortSignal?: AbortSignal,
  ): Promise<Result<FileInfo[], FileError>> {
    const bounded = await this.#boundedExisting(path);
    return bounded.ok ? super.listDir(bounded.value, abortSignal) : bounded;
  }

  override async canonicalPath(
    path: string,
  ): Promise<Result<string, FileError>> {
    return this.#boundedExisting(path);
  }

  override async exists(path: string): Promise<Result<boolean, FileError>> {
    const bounded = await this.#boundedForCreate(path);
    return bounded.ok ? super.exists(bounded.value) : bounded;
  }

  override async createDir(
    path: string,
    options?: { recursive?: boolean },
  ): Promise<Result<void, FileError>> {
    const bounded = await this.#boundedForCreate(path);
    return bounded.ok ? super.createDir(bounded.value, options) : bounded;
  }

  override async remove(
    path: string,
    options?: { recursive?: boolean; force?: boolean },
  ): Promise<Result<void, FileError>> {
    const bounded = await this.#boundedExisting(path);
    return bounded.ok ? super.remove(bounded.value, options) : bounded;
  }
}

const bindTool = (
  tool: AgentHarnessTool<ExecutionToolContext>,
  context: ExecutionToolContext,
): AgentTool =>
  ({
    ...tool,
    execute: (toolCallId, params, signal, onUpdate) =>
      tool.execute(toolCallId, params as never, signal, onUpdate, context),
  }) as AgentTool;

const workspaceTools = (env: ExecutionEnv): AgentTool[] => {
  const context = { env };
  return [
    bindTool(createReadTool(), context),
    bindTool(createWriteTool(), context),
    bindTool(createEditTool(), context),
  ];
};

const textFromAgentState = (messages: readonly AgentMessage[]): string => {
  const lastMsg = messages.at(-1);
  if (lastMsg?.role !== "assistant" || !Array.isArray(lastMsg.content))
    return "";
  return lastMsg.content
    .filter((content) => content.type === "text")
    .map((content) => content.text)
    .join("");
};

export function createPiConversationRunner(
  config: PiConversationConfig,
): ConversationRunner {
  const models =
    config.models ??
    builtinModels({
      credentials: config.credentials,
      authContext: config.authContext ?? noAmbientAuthContext,
    });

  return {
    async submitTurn(input: AgentTurnInput): Promise<AgentTurnResult> {
      const model = models.getModel(config.provider, config.model);
      if (!model) {
        throw new AgentTurnError("agent_unavailable");
      }
      const auth = await models
        .checkAuth(config.provider)
        .catch(() => undefined);
      if (!auth) {
        throw new AgentTurnError("agent_unavailable");
      }

      const env = new BoundedExecutionEnv(input.tools.workingDirectory);
      const agent = new Agent({
        streamFn: models.streamSimple.bind(models),
        initialState: {
          model,
          systemPrompt: config.systemPrompt ?? "",
          thinkingLevel: "off",
          tools: workspaceTools(env).filter((tool) =>
            input.tools.enabledToolNames.includes(tool.name),
          ),
          messages: input.history.map(toAgentMessage),
        },
        sessionId: input.conversationId,
        toolExecution: "sequential",
        beforeToolCall: async ({ toolCall }) => {
          if (!input.tools.enabledToolNames.includes(toolCall.name))
            return {
              block: true,
              terminate: true,
              reason: "Tool is not enabled for this Project Session",
            };
          return undefined;
        },
      });

      const textParts: string[] = [];

      try {
        await new Promise<void>((resolvePromise, reject) => {
          const unsubscribe = agent.subscribe((event: AgentEvent) => {
            switch (event.type) {
              case "message_update": {
                const fullText = textFromAgentState(agent.state.messages);
                const delta = fullText.slice(textParts.join("").length);
                if (delta.length > 0) {
                  textParts.push(delta);
                  input.onDelta?.({ kind: "assistant_text", text: delta });
                }
                break;
              }
              case "agent_end": {
                unsubscribe();
                resolvePromise();
                break;
              }
            }
          });

          agent
            .prompt(input.prompt)
            .then(() => agent.waitForIdle())
            .catch((error: unknown) => {
              unsubscribe();
              reject(error);
            });
        });
        const assistantText = textFromAgentState(agent.state.messages);
        return {
          text: assistantText.length > 0 ? assistantText : textParts.join(""),
        };
      } catch {
        throw new AgentTurnError("agent_turn_failed");
      } finally {
        await env.cleanup();
      }
    },
  };
}
