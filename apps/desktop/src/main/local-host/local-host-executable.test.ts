import { beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => ({
  app: {
    isPackaged: false,
    getPath: vi.fn(() => "/user-data"),
  },
}));
const fs = vi.hoisted(() => {
  const mock = {
    existsSync: vi.fn(() => true),
    realpathSync: vi.fn((path: string) => path),
  };
  return { ...mock, default: mock };
});
const childProcess = vi.hoisted(() => {
  const mock = {
    execFileSync: vi.fn((executable: string, args: readonly string[]) => {
      if (executable === "node" && args[0] === "-p")
        return "/opt/node/bin/node\n";
      if (executable === "/opt/node/bin/node" && args[0] === "--version")
        return "v22.23.1\n";
      throw new Error("unexpected execFileSync call");
    }),
  };
  return { ...mock, default: mock };
});

vi.mock("electron", () => electron);
vi.mock("node:fs", () => fs);
vi.mock("node:child_process", () => childProcess);

const { resolveLocalHostExecutable } =
  await import("./local-host-executable.js");

describe("Local Host executable resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SPACEZERO_DEV_NODE_EXECUTABLE;
    delete process.env.npm_node_execpath;
  });

  it("falls back to the Node executable on PATH when Electron does not inherit npm_node_execpath", () => {
    const executable = resolveLocalHostExecutable();

    expect(executable.nodeExecutable).toBe("/opt/node/bin/node");
    expect(childProcess.execFileSync).toHaveBeenCalledWith(
      "node",
      ["-p", "process.execPath"],
      expect.objectContaining({ encoding: "utf8", timeout: 2000 }),
    );
    expect(childProcess.execFileSync).toHaveBeenCalledWith(
      "/opt/node/bin/node",
      ["--version"],
      expect.objectContaining({ encoding: "utf8", timeout: 2000 }),
    );
  });
});
