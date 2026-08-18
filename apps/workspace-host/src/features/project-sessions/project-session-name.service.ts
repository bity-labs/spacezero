import { randomInt as cryptoRandomInt } from "node:crypto";
import { WINE_APPELLATIONS } from "./wine-appellations.data.js";

export const SESSION_NAME_SUFFIX_ALPHABET =
  "23456789abcdefghjkmnpqrstuvwxyz" as const;

export interface SessionNameEntropy {
  readonly randomInt: (upperBound: number) => number;
}

export const productionSessionNameEntropy: SessionNameEntropy = {
  randomInt: (upperBound) => cryptoRandomInt(upperBound),
};

export const isValidSessionName = (value: string): boolean =>
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

const suffixFromOrdinal = (ordinal: number): string => {
  const base = SESSION_NAME_SUFFIX_ALPHABET.length;
  let value = ordinal;
  let suffix = "";
  for (let index = 0; index < 5; index += 1) {
    suffix = SESSION_NAME_SUFFIX_ALPHABET[value % base] + suffix;
    value = Math.floor(value / base);
  }
  return suffix;
};

export const chooseSessionNameCandidate = (
  reservedNames: ReadonlySet<string>,
  entropy: SessionNameEntropy = productionSessionNameEntropy,
): { readonly name: string; readonly baseName: string } | undefined => {
  const start = entropy.randomInt(WINE_APPELLATIONS.length);
  for (let offset = 0; offset < WINE_APPELLATIONS.length; offset += 1) {
    const baseName =
      WINE_APPELLATIONS[(start + offset) % WINE_APPELLATIONS.length]!;
    if (!reservedNames.has(baseName)) return { name: baseName, baseName };
  }

  const suffixSpace = SESSION_NAME_SUFFIX_ALPHABET.length ** 5;
  for (let attempt = 0; attempt < 128; attempt += 1) {
    const baseName =
      WINE_APPELLATIONS[entropy.randomInt(WINE_APPELLATIONS.length)]!;
    const suffix = Array.from(
      { length: 5 },
      () =>
        SESSION_NAME_SUFFIX_ALPHABET[
          entropy.randomInt(SESSION_NAME_SUFFIX_ALPHABET.length)
        ],
    ).join("");
    const name = `${baseName}-${suffix}`;
    if (!reservedNames.has(name)) return { name, baseName };
  }
  for (const baseName of WINE_APPELLATIONS) {
    for (let ordinal = 0; ordinal < suffixSpace; ordinal += 1) {
      const name = `${baseName}-${suffixFromOrdinal(ordinal)}`;
      if (!reservedNames.has(name)) return { name, baseName };
    }
  }
  return undefined;
};
