import {
  closeSync,
  createReadStream,
  createWriteStream,
  type ReadStream,
} from "node:fs";
import { once } from "node:events";

const MAX_FRAME_BYTES = 8192;
export const readBoundedJsonFrame = async (
  fd: number,
  timeoutMs = 10_000,
): Promise<unknown> => {
  const stream = createReadStream(null as never, {
    fd,
    autoClose: true,
    encoding: "utf8",
  });
  let data = "";
  const timeout = setTimeout(
    () => stream.destroy(new Error("startup timeout")),
    timeoutMs,
  );
  try {
    for await (const chunk of stream) {
      data += chunk;
      if (data.length > MAX_FRAME_BYTES) throw new Error("frame too large");
      if (data.includes("\n")) break;
    }
  } finally {
    clearTimeout(timeout);
    stream.destroy();
  }
  const line = data.split("\n")[0];
  if (!line) throw new Error("missing bootstrap frame");
  return JSON.parse(line) as unknown;
};
export const writeJsonFrame = async (
  fd: number,
  value: unknown,
): Promise<void> => {
  const stream = createWriteStream(null as never, {
    fd,
    autoClose: true,
    encoding: "utf8",
  });
  stream.end(`${JSON.stringify(value)}\n`);
  await once(stream, "close");
};
export interface LifetimeWait {
  readonly done: Promise<void>;
  readonly close: () => void;
}
export const waitForLifetimeEnd = (fd: number): LifetimeWait => {
  const stream: ReadStream = createReadStream(null as never, {
    fd,
    autoClose: false,
  });
  let settle!: () => void;
  let closed = false;
  const done = new Promise<void>((resolve) => {
    settle = resolve;
  });
  const close = (): void => {
    if (closed) return;
    closed = true;
    stream.destroy();
    try {
      closeSync(fd);
    } catch {
      // The peer may have closed the inherited descriptor concurrently.
    }
    settle();
  };
  for (const event of ["data", "end", "close", "error"] as const)
    stream.once(event, close);
  return { done, close };
};
