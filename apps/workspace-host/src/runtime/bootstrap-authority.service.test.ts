import { describe, expect, it } from "vitest";
import {
  BootstrapConsumedError,
  createBootstrapAuthority,
} from "./bootstrap-authority.service.js";

const now = Date.parse("2026-08-16T12:00:00.000Z");
const frame = {
  bootstrapSecret: "bootstrap-secret-abcdefghijklmnopqrstuvwxyz0123456789",
  issuedAt: new Date(now).toISOString(),
  allowedRendererOrigin: "spacezero://renderer",
  spaceZeroHome: "/tmp/SpaceZero",
  protocolMin: "4" as const,
  protocolMax: "4" as const,
};

const authority = (overrides: { issuedAt?: number; deadline?: number } = {}) =>
  createBootstrapAuthority({
    frame: {
      ...frame,
      issuedAt: new Date(overrides.issuedAt ?? now).toISOString(),
    },
    deadlineMs: overrides.deadline ?? now + 10_000,
    now: () => now,
  });

describe("bootstrap authority", () => {
  it("accepts the protected secret exactly once", () => {
    const bootstrap = authority();
    expect(() => bootstrap.consume(frame.bootstrapSecret)).not.toThrow();
    expect(() => bootstrap.consume(frame.bootstrapSecret)).toThrow(
      BootstrapConsumedError,
    );
  });

  it("consumes the exchange after a mismatched proof", () => {
    const bootstrap = authority();
    expect(() =>
      bootstrap.consume("wrong-secret-abcdefghijklmnopqrstuvwxyz"),
    ).toThrow(BootstrapConsumedError);
    expect(() => bootstrap.consume(frame.bootstrapSecret)).toThrow(
      BootstrapConsumedError,
    );
  });

  it("rejects expired, stale, and future bootstrap frames", () => {
    expect(() =>
      authority({ deadline: now }).consume(frame.bootstrapSecret),
    ).toThrow(BootstrapConsumedError);
    expect(() =>
      authority({ issuedAt: now - 10_001 }).consume(frame.bootstrapSecret),
    ).toThrow(BootstrapConsumedError);
    expect(() =>
      authority({ issuedAt: now + 5_001 }).consume(frame.bootstrapSecret),
    ).toThrow(BootstrapConsumedError);
  });
});
