import {
  access,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxThinking,
  fauxToolCall,
  InMemoryCredentialStore,
  type Context,
  type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentTurnError, AgentTurnInput } from "./conversation.model.js";
import { createPiConversationRunner } from "./pi-conversation.adapter.js";

const temps: string[] = [];
const tempRoot = async () => {
  const dir = await mkdtemp(join(tmpdir(), "spacezero-pi-adapter-"));
  temps.push(dir);
  return dir;
};

const input = async (
  overrides: Partial<AgentTurnInput> = {},
): Promise<AgentTurnInput> => {
  const worktreePath = await tempRoot();
  return {
    sessionId: "11111111-1111-4111-8111-111111111111",
    conversationId: "22222222-2222-4222-8222-222222222222",
    history: [],
    tools: {
      kind: "managedWorktree",
      workingDirectory: worktreePath,
      enabledToolNames: ["read", "write", "edit"],
    },
    runtime: {
      providerId: "faux",
      modelId: "faux-1",
      thinkingLevel: "off",
    },
    prompt: "Build the wine list view",
    ...overrides,
  };
};

afterEach(async () => {
  await Promise.all(
    temps.map((dir) => rm(dir, { recursive: true, force: true })),
  );
  temps.length = 0;
});

describe("createPiConversationRunner", () => {
  it("returns a ConversationRunner with an injected credential store", () => {
    const runner = createPiConversationRunner({
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      credentials: new InMemoryCredentialStore(),
    });

    expect(runner).toBeDefined();
    expect(typeof runner.submitTurn).toBe("function");
  });

  it("accepts optional system prompt", () => {
    const runner = createPiConversationRunner({
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      credentials: new InMemoryCredentialStore(),
      systemPrompt: "You are a helpful assistant.",
    });

    expect(runner).toBeDefined();
  });

  it("submits turns with durable Session history and stable provider session id", async () => {
    const faux = fauxProvider();
    const models = createModels();
    models.setProvider(faux.provider);
    const seen: {
      readonly context: Context;
      readonly options: SimpleStreamOptions | undefined;
    }[] = [];
    faux.setResponses([
      (context, options) => {
        seen.push({ context, options });
        return fauxAssistantMessage("done");
      },
    ]);
    const runner = createPiConversationRunner({
      provider: faux.provider.id,
      model: faux.getModel().id,
      credentials: new InMemoryCredentialStore(),
      models,
    });
    const turn = await input({
      history: [
        { role: "user", text: "first" },
        { role: "assistant", text: "second" },
      ],
      prompt: "third",
    });

    await expect(runner.submitTurn(turn)).resolves.toMatchObject({
      text: "done",
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]?.options?.sessionId).toBe(turn.conversationId);
    expect(seen[0]?.context.messages).toMatchObject([
      { role: "user", content: "first" },
      { role: "assistant", content: [{ type: "text", text: "second" }] },
      { role: "user", content: [{ type: "text", text: "third" }] },
    ]);
  });

  it("blocks file tool paths that escape the managed worktree", async () => {
    const faux = fauxProvider();
    const models = createModels();
    models.setProvider(faux.provider);
    faux.setResponses([
      fauxAssistantMessage(
        fauxToolCall("write", {
          path: "../escape.txt",
          content: "bad",
        }),
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage("done"),
    ]);
    const runner = createPiConversationRunner({
      provider: faux.provider.id,
      model: faux.getModel().id,
      credentials: new InMemoryCredentialStore(),
      models,
    });
    const turn = await input();

    await expect(runner.submitTurn(turn)).resolves.toMatchObject({
      text: "done",
    });
    const workingDirectory =
      turn.tools.kind === "managedWorktree" ? turn.tools.workingDirectory : "";
    await expect(
      access(join(workingDirectory, "..", "escape.txt")),
    ).rejects.toThrow();
  });

  it("blocks writes through in-worktree dangling file symlinks", async () => {
    const faux = fauxProvider();
    const models = createModels();
    models.setProvider(faux.provider);
    faux.setResponses([
      fauxAssistantMessage(
        fauxToolCall("write", {
          path: "linked-file.txt",
          content: "bad",
        }),
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage("done"),
    ]);
    const runner = createPiConversationRunner({
      provider: faux.provider.id,
      model: faux.getModel().id,
      credentials: new InMemoryCredentialStore(),
      models,
    });
    const turn = await input();
    const outside = await tempRoot();
    const workingDirectory =
      turn.tools.kind === "managedWorktree" ? turn.tools.workingDirectory : "";
    await symlink(
      join(outside, "escaped.txt"),
      join(workingDirectory, "linked-file.txt"),
    );

    await expect(runner.submitTurn(turn)).resolves.toMatchObject({
      text: "done",
    });
    await expect(access(join(outside, "escaped.txt"))).rejects.toThrow();
  });

  it("blocks writes through in-worktree directory symlinks", async () => {
    const faux = fauxProvider();
    const models = createModels();
    models.setProvider(faux.provider);
    faux.setResponses([
      fauxAssistantMessage(
        fauxToolCall("write", {
          path: "linked/escaped.txt",
          content: "bad",
        }),
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage("done"),
    ]);
    const runner = createPiConversationRunner({
      provider: faux.provider.id,
      model: faux.getModel().id,
      credentials: new InMemoryCredentialStore(),
      models,
    });
    const turn = await input();
    const outside = await tempRoot();
    const workingDirectory =
      turn.tools.kind === "managedWorktree" ? turn.tools.workingDirectory : "";
    await symlink(outside, join(workingDirectory, "linked"), "dir");

    await expect(runner.submitTurn(turn)).resolves.toMatchObject({
      text: "done",
    });
    await expect(access(join(outside, "escaped.txt"))).rejects.toThrow();
  });

  it("emits safe tool arguments and results without raw protected values", async () => {
    const faux = fauxProvider();
    const credentials = new InMemoryCredentialStore();
    await credentials.modify(faux.provider.id, async () => ({
      type: "api_key",
      key: "sk-live-secret",
    }));
    const models = createModels();
    models.setProvider(faux.provider);
    const events: unknown[] = [];
    faux.setResponses([
      fauxAssistantMessage(
        fauxToolCall("read", {
          path: "src/app.ts",
          absolutePath: "/home/builder/.config/some-tool/config.json",
          apiKey: "sk-live-secret",
        }),
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage("done"),
    ]);
    const runner = createPiConversationRunner({
      provider: faux.provider.id,
      model: faux.getModel().id,
      credentials,
      models,
      protectedPathRoots: ["/private/pi-transcripts"],
    });
    const turn = await input({
      onEvent: async (event) => {
        events.push(event);
      },
    });
    const workingDirectory =
      turn.tools.kind === "managedWorktree" ? turn.tools.workingDirectory : "";
    await mkdir(join(workingDirectory, "src"));
    await writeFile(join(workingDirectory, "src/app.ts"), "export {};\n");

    const result = await runner.submitTurn(turn);

    expect(result.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool-call",
          toolName: "read",
          status: "succeeded",
          arguments: {
            path: "src/app.ts",
            absolutePath: "/home/builder/.config/some-tool/config.json",
            apiKey: "[redacted]",
          },
          result: expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({ type: "text" }),
            ]),
          }),
        }),
      ]),
    );
    expect(JSON.stringify(events)).not.toContain("sk-live-secret");
    expect(JSON.stringify(result)).not.toContain("sk-live-secret");
  });

  it("preserves provider-exposed readable reasoning in content order without signatures", async () => {
    const faux = fauxProvider({
      models: [
        { id: "reasoning-model", name: "Reasoning Model", reasoning: true },
      ],
    });
    const models = createModels();
    models.setProvider(faux.provider);
    const events: unknown[] = [];
    faux.setResponses([
      fauxAssistantMessage([
        fauxThinking("I should inspect the request."),
        fauxText("The answer."),
      ]),
    ]);
    const runner = createPiConversationRunner({
      provider: faux.provider.id,
      model: "reasoning-model",
      credentials: new InMemoryCredentialStore(),
      models,
    });

    const result = await runner.submitTurn(
      await input({
        runtime: {
          providerId: faux.provider.id,
          modelId: "reasoning-model",
          thinkingLevel: "high",
        },
        onEvent: async (event) => {
          events.push(event);
        },
      }),
    );

    expect(result).toEqual({
      text: "The answer.",
      parts: [
        {
          type: "reasoning",
          order: 1,
          text: "I should inspect the request.",
        },
        { type: "text", order: 2, text: "The answer." },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("Signature");
    expect(
      events.filter(
        (event) =>
          (event as { readonly part?: { readonly type?: string } }).part
            ?.type === "reasoning",
      ).length,
    ).toBeGreaterThan(0);
  });

  it("excludes redacted or opaque thinking payloads instead of fabricating reasoning", async () => {
    const faux = fauxProvider({
      models: [
        { id: "reasoning-model", name: "Reasoning Model", reasoning: true },
      ],
    });
    const models = createModels();
    models.setProvider(faux.provider);
    faux.setResponses([
      fauxAssistantMessage([
        {
          type: "thinking",
          thinking: "",
          thinkingSignature: "encrypted-provider-signature",
          redacted: true,
        },
        fauxText("Visible answer."),
      ]),
    ]);
    const runner = createPiConversationRunner({
      provider: faux.provider.id,
      model: "reasoning-model",
      credentials: new InMemoryCredentialStore(),
      models,
    });

    const result = await runner.submitTurn(
      await input({
        runtime: {
          providerId: faux.provider.id,
          modelId: "reasoning-model",
          thinkingLevel: "high",
        },
      }),
    );

    expect(result).toEqual({
      text: "Visible answer.",
      parts: [{ type: "text", order: 1, text: "Visible answer." }],
    });
    expect(JSON.stringify(result)).not.toContain(
      "encrypted-provider-signature",
    );
  });

  it("resolves provider, model, and thinking level from the per-turn runtime snapshot", async () => {
    const faux = fauxProvider({
      models: [
        { id: "default-model", name: "Default Model", reasoning: true },
        { id: "session-model", name: "Session Model", reasoning: true },
      ],
    });
    const models = createModels();
    models.setProvider(faux.provider);
    const seenModels: string[] = [];
    faux.setResponses([
      (_context, _options, _state, model) => {
        seenModels.push(model.id);
        return fauxAssistantMessage("done");
      },
    ]);
    const runner = createPiConversationRunner({
      provider: faux.provider.id,
      model: "default-model",
      credentials: new InMemoryCredentialStore(),
      models,
    });

    await expect(
      runner.submitTurn(
        await input({
          runtime: {
            providerId: faux.provider.id,
            modelId: "session-model",
            thinkingLevel: "high",
          },
        }),
      ),
    ).resolves.toMatchObject({ text: "done" });

    expect(seenModels).toEqual(["session-model"]);
  });

  it("rejects runtime models that are not available to Pi", async () => {
    const faux = fauxProvider({
      models: [{ id: "filtered-model", name: "Filtered Model" }],
    });
    const models = createModels();
    models.setProvider(faux.provider);
    models.getAvailable = async () => [];
    const runner = createPiConversationRunner({
      provider: faux.provider.id,
      model: "filtered-model",
      credentials: new InMemoryCredentialStore(),
      models,
    });

    await expect(
      runner.submitTurn(
        await input({
          runtime: {
            providerId: faux.provider.id,
            modelId: "filtered-model",
            thinkingLevel: "off",
          },
        }),
      ),
    ).rejects.toMatchObject({ code: "agent_configuration_invalid" });
  });

  it("rejects unsupported runtime thinking levels", async () => {
    const faux = fauxProvider({
      models: [{ id: "plain-model", name: "Plain Model", reasoning: false }],
    });
    const models = createModels();
    models.setProvider(faux.provider);
    const runner = createPiConversationRunner({
      provider: faux.provider.id,
      model: "plain-model",
      credentials: new InMemoryCredentialStore(),
      models,
    });

    await expect(
      runner.submitTurn(
        await input({
          runtime: {
            providerId: faux.provider.id,
            modelId: "plain-model",
            thinkingLevel: "high",
          },
        }),
      ),
    ).rejects.toMatchObject({ code: "agent_configuration_invalid" });
  });

  it("fails the turn when Pi finishes with a terminal stream error", async () => {
    const faux = fauxProvider();
    const models = createModels();
    models.setProvider(faux.provider);
    faux.setResponses([
      fauxAssistantMessage("partial before error", {
        stopReason: "error",
      }),
    ]);
    const runner = createPiConversationRunner({
      provider: faux.provider.id,
      model: faux.getModel().id,
      credentials: new InMemoryCredentialStore(),
      models,
    });

    await expect(runner.submitTurn(await input())).rejects.toMatchObject({
      code: "agent_turn_failed",
    } satisfies Partial<AgentTurnError>);
  });

  it("does not treat a provider-side terminal abort as a successful turn", async () => {
    const faux = fauxProvider();
    const models = createModels();
    models.setProvider(faux.provider);
    faux.setResponses([
      fauxAssistantMessage("partial before abort", {
        stopReason: "aborted",
      }),
    ]);
    const runner = createPiConversationRunner({
      provider: faux.provider.id,
      model: faux.getModel().id,
      credentials: new InMemoryCredentialStore(),
      models,
    });

    await expect(runner.submitTurn(await input())).rejects.toMatchObject({
      code: "agent_turn_failed",
    } satisfies Partial<AgentTurnError>);
  });

  it("maps a caller-signalled abort to an interrupted turn", async () => {
    const faux = fauxProvider();
    const models = createModels();
    models.setProvider(faux.provider);
    const controller = new AbortController();
    controller.abort();
    const runner = createPiConversationRunner({
      provider: faux.provider.id,
      model: faux.getModel().id,
      credentials: new InMemoryCredentialStore(),
      models,
    });

    await expect(
      runner.submitTurn(await input({ signal: controller.signal })),
    ).rejects.toMatchObject({
      code: "agent_turn_interrupted",
    } satisfies Partial<AgentTurnError>);
  });

  it("configures only bounded file mutation tools for the managed worktree", async () => {
    const faux = fauxProvider();
    const models = createModels();
    models.setProvider(faux.provider);
    const toolNames: string[][] = [];
    faux.setResponses([
      (context) => {
        toolNames.push(context.tools?.map((tool) => tool.name) ?? []);
        return fauxAssistantMessage("done");
      },
    ]);
    const runner = createPiConversationRunner({
      provider: faux.provider.id,
      model: faux.getModel().id,
      credentials: new InMemoryCredentialStore(),
      models,
    });

    await expect(runner.submitTurn(await input())).resolves.toMatchObject({
      text: "done",
    });

    expect(toolNames).toEqual([["read", "write", "edit"]]);
  });
});
