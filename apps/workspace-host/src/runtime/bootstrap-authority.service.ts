import { timingSafeEqual } from "node:crypto";
import {
  parseLocalHostBootstrapFrame,
  type LocalHostBootstrapFrame,
} from "@spacezero/host-contracts";

export class BootstrapConsumedError extends Error {
  constructor() {
    super("bootstrap unavailable");
  }
}

const safeEqual = (expectedSecret: string, actualSecret: string): boolean => {
  const expected = Buffer.from(expectedSecret);
  const actual = Buffer.from(actualSecret);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

export const createBootstrapAuthority = (options: {
  readonly frame: LocalHostBootstrapFrame;
  readonly deadlineMs: number;
  readonly now?: () => number;
}) => {
  let consumed = false;
  const now = options.now ?? Date.now;
  const issuedAtMs = Date.parse(options.frame.issuedAt);
  return {
    readonlyFrame: {
      allowedRendererOrigin: options.frame.allowedRendererOrigin,
      protocolMin: options.frame.protocolMin,
      protocolMax: options.frame.protocolMax,
    },
    consume(candidateSecret: string): void {
      const current = now();
      const staleByMs = current - issuedAtMs;
      const futureByMs = issuedAtMs - current;
      if (
        consumed ||
        current >= options.deadlineMs ||
        staleByMs > 10_000 ||
        futureByMs > 5_000
      ) {
        consumed = true;
        throw new BootstrapConsumedError();
      }
      consumed = true;
      if (!safeEqual(options.frame.bootstrapSecret, candidateSecret))
        throw new BootstrapConsumedError();
    },
  };
};

export const parseBootstrapFrameForAuthority = (
  value: unknown,
): LocalHostBootstrapFrame => parseLocalHostBootstrapFrame(value);
