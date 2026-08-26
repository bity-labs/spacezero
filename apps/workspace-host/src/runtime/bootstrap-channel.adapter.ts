import { createReadStream, createWriteStream } from "node:fs";
import { once } from "node:events";
import { Socket } from "node:net";

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
  const stream = new Socket({ fd, readable: true, writable: false });
  let settle!: () => void;
  let closed = false;
  const done = new Promise<void>((resolve) => {
    settle = resolve;
  });
  const finish = (): void => {
    if (closed) return;
    closed = true;
    settle();
  };
  stream.once("data", () => stream.destroy());
  stream.once("end", finish);
  stream.once("close", finish);
  stream.once("error", finish);
  const close = (): void => {
    if (!stream.destroyed) stream.destroy();
    finish();
  };
  return { done, close };
};
