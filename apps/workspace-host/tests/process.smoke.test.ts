import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("workspace host process", () => {
  it("reports package foundation version without Host Protocol semantics", () => {
    const result = spawnSync(
      process.execPath,
      [join(process.cwd(), "dist/main.js"), "--version"],
      {
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("spacezero-workspace-host 0.0.0");
  });

  it("starts under ordinary Node and runs shutdown finalizer on SIGTERM", async () => {
    const child = spawn(
      process.execPath,
      [join(process.cwd(), "dist/main.js")],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const output: string[] = [];
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => output.push(chunk));
    try {
      await waitFor(() => output.join("").includes('"event":"startup"'));
      child.kill("SIGTERM");
      const [code] = await waitForProcessExit(child, 5000);
      expect(code).toBe(0);
      const lines = output.join("");
      expect(lines).toContain('"process":"workspace-host"');
      expect(lines).toContain('"event":"shutdown"');
      expect(lines).not.toContain("protocol");
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await waitForProcessExit(child, 5000);
      }
    }
  });
});

const waitFor = async (predicate: () => boolean): Promise<void> => {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() > deadline)
      throw new Error("timed out waiting for host output");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
};

const waitForProcessExit = async (
  child: ReturnType<typeof spawn>,
  timeoutMs: number,
): Promise<[number | null, NodeJS.Signals | null]> => {
  if (child.exitCode !== null || child.signalCode !== null)
    return [child.exitCode, child.signalCode];
  let timeout: NodeJS.Timeout | undefined;
  try {
    timeout = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
    }, timeoutMs);
    return (await once(child, "close")) as [
      number | null,
      NodeJS.Signals | null,
    ];
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};
