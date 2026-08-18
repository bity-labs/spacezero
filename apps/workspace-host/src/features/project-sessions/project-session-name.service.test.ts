import { describe, expect, it } from "vitest";
import { WINE_APPELLATIONS } from "./wine-appellations.data.js";
import {
  SESSION_NAME_SUFFIX_ALPHABET,
  chooseSessionNameCandidate,
  isValidSessionName,
} from "./project-session-name.service.js";

describe("Project Session wine-name allocation", () => {
  it("bundles normalized unique French appellations", () => {
    expect(WINE_APPELLATIONS).toHaveLength(168);
    expect(new Set(WINE_APPELLATIONS).size).toBe(168);
    expect(WINE_APPELLATIONS).toContain("rose-des-riceys");
    expect(WINE_APPELLATIONS).toContain("cremant-d-alsace");
    expect(WINE_APPELLATIONS).toContain("medoc");
    expect(WINE_APPELLATIONS).toContain("saint-estephe");
    expect(WINE_APPELLATIONS.every(isValidSessionName)).toBe(true);
  });

  it("chooses an unused base name first", () => {
    expect(
      chooseSessionNameCandidate(new Set(), { randomInt: () => 0 }),
    ).toEqual({ name: "champagne", baseName: "champagne" });
  });

  it("adds a non-ambiguous five-character suffix after base exhaustion", () => {
    const reserved = new Set<string>(WINE_APPELLATIONS);
    const candidate = chooseSessionNameCandidate(reserved, {
      randomInt: () => 0,
    });
    expect(candidate?.name).toBe("champagne-22222");
    expect(candidate?.name).toMatch(/-[23456789abcdefghjkmnpqrstuvwxyz]{5}$/);
    expect(SESSION_NAME_SUFFIX_ALPHABET).not.toMatch(/[01ilo]/);
  });
});
