import { once } from "node:events";
import type { ChildProcess } from "node:child_process";

export const readLine = async (
  stream: NodeJS.ReadableStream,
): Promise<string> => {
  let text = "";
  for await (const chunk of stream) {
    text += String(chunk);
    if (text.includes("\n")) break;
  }
  return text.split("\n")[0] ?? "";
};
export const waitForProcessExit = async (
  child: ChildProcess,
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
export const killIfRunning = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await waitForProcessExit(child, 5000);
  }
};
