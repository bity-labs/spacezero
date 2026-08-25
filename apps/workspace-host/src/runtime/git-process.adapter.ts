import { execFile } from "node:child_process";

export interface GitProcessOptions {
  readonly cwd: string;
  readonly args: readonly string[];
  readonly signal?: AbortSignal | undefined;
  readonly timeoutMs?: number;
}

const outputLimit = 64 * 1024;
const defaultTimeoutMs = 10_000;
const forceKillDelayMs = 200;

export const createGitAbortError = () => {
  const error = new Error("Git command was aborted");
  error.name = "AbortError";
  return error;
};

export const runGit = ({
  cwd,
  args,
  signal,
  timeoutMs = defaultTimeoutMs,
}: GitProcessOptions): Promise<string> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createGitAbortError());
      return;
    }
    let settled = false;
    const timers: { timeout?: NodeJS.Timeout; forceKill?: NodeJS.Timeout } = {};
    const cleanup = () => {
      if (timers.timeout) clearTimeout(timers.timeout);
      if (timers.forceKill) clearTimeout(timers.forceKill);
      signal?.removeEventListener("abort", abort);
    };
    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const resolveOnce = (value: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const child = execFile(
      "git",
      ["-C", cwd, ...args],
      {
        shell: false,
        maxBuffer: outputLimit,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          SystemRoot: process.env.SystemRoot,
        },
      },
      (error, stdout) => {
        if (error) rejectOnce(error);
        else resolveOnce(stdout.trim());
      },
    );
    const kill = () => {
      if (child.exitCode === null && !child.killed) child.kill("SIGTERM");
      timers.forceKill = setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
      }, forceKillDelayMs);
      timers.forceKill.unref();
    };
    function abort() {
      kill();
      child.once("close", () => rejectOnce(createGitAbortError()));
    }
    child.stdin?.destroy();
    signal?.addEventListener("abort", abort, { once: true });
    timers.timeout = setTimeout(() => {
      kill();
      child.once("close", () => rejectOnce(new Error("git timed out")));
    }, timeoutMs);
    timers.timeout.unref();
  });
