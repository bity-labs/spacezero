import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createPiPrivateSessionStateRepository } from "./private-session-state.repository.js";

describe("Pi private session state repository", () => {
  it("records operation boundaries without exposing transcript state", async () => {
    const directory = await mkdtemp(join(tmpdir(), "spacezero-private-pi-"));
    const repository = createPiPrivateSessionStateRepository({ directory });

    const created = await repository.create({
      id: "session-1",
      conversationId: "conversation-1",
    });
    expect(created.status).toBe("ready");

    await repository.recordOperationStarted({
      id: "session-1",
      operationId: "turn-1",
      turnId: "turn-1",
      prompt: "hello",
    });
    const active = await repository.read("session-1");
    expect(active).toMatchObject({
      status: "operation_started",
      openOperationId: "turn-1",
    });

    await repository.recordOperationSettled({
      id: "session-1",
      operationId: "turn-1",
      assistantText: "hi",
    });
    const settled = await repository.read("session-1");
    expect(settled).toMatchObject({
      status: "operation_settled",
      lastSettledOperationId: "turn-1",
    });
  });
});
