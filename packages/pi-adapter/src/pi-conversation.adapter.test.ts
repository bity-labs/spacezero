import { access, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  InMemoryCredentialStore,
  type Context,
  type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentTurnInput } from "./conversation.model.js";
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
    worktreePath,
    history: [],
    tools: {
      workingDirectory: worktreePath,
      enabledToolNames: ["read", "write", "edit"],
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

    await expect(runner.submitTurn(turn)).resolves.toEqual({ text: "done" });

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

    await expect(runner.submitTurn(turn)).resolves.toEqual({ text: "done" });
    await expect(
      access(join(turn.worktreePath, "..", "escape.txt")),
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
    await symlink(
      join(outside, "escaped.txt"),
      join(turn.worktreePath, "linked-file.txt"),
    );

    await expect(runner.submitTurn(turn)).resolves.toEqual({ text: "done" });
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
    await symlink(outside, join(turn.worktreePath, "linked"), "dir");

    await expect(runner.submitTurn(turn)).resolves.toEqual({ text: "done" });
    await expect(access(join(outside, "escaped.txt"))).rejects.toThrow();
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

    await expect(runner.submitTurn(await input())).resolves.toEqual({
      text: "done",
    });

    expect(toolNames).toEqual([["read", "write", "edit"]]);
  });
});
