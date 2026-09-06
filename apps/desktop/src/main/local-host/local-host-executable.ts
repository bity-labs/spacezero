import { app } from "electron";
import { existsSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

export class LocalHostUnavailableError extends Error {
  constructor(message = "Local Host unavailable") {
    super(message);
  }
}
export interface LocalHostExecutable {
  readonly nodeExecutable: string;
  readonly hostEntry: string;
  readonly cwd: string;
}
const repoRoot = resolve(process.cwd(), "../..");
const resolveDevelopmentNodeExecutable = (): string | undefined => {
  const configured =
    process.env.SPACEZERO_DEV_NODE_EXECUTABLE ?? process.env.npm_node_execpath;
  if (configured) return configured;
  try {
    return execFileSync("node", ["-p", "process.execPath"], {
      encoding: "utf8",
      timeout: 2000,
    }).trim();
  } catch {
    return undefined;
  }
};
export const resolveLocalHostExecutable = (): LocalHostExecutable => {
  if (app.isPackaged) throw new LocalHostUnavailableError();
  const nodeExecutable = resolveDevelopmentNodeExecutable();
  if (
    !nodeExecutable ||
    !resolve(nodeExecutable).startsWith("/") ||
    !existsSync(nodeExecutable)
  )
    throw new LocalHostUnavailableError(
      "development Node executable unavailable",
    );
  const version = execFileSync(nodeExecutable, ["--version"], {
    encoding: "utf8",
    timeout: 2000,
  }).trim();
  if (version !== "v22.23.1")
    throw new LocalHostUnavailableError("development Node version mismatch");
  const hostEntry = join(repoRoot, "apps/workspace-host/dist/main.js");
  if (!existsSync(hostEntry))
    throw new LocalHostUnavailableError("Workspace Host build unavailable");
  const realHost = realpathSync(hostEntry);
  const realHostRoot = realpathSync(join(repoRoot, "apps/workspace-host"));
  if (!realHost.startsWith(`${realHostRoot}/`))
    throw new LocalHostUnavailableError("Workspace Host path invalid");
  return {
    nodeExecutable: realpathSync(nodeExecutable),
    hostEntry: realHost,
    cwd: app.getPath("userData"),
  };
};
