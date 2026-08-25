import { RENDERER_INDEX_URL, RENDERER_ORIGIN } from "./renderer-protocol.js";

export interface RendererPolicyOptions {
  readonly isDevelopment: boolean;
  readonly rendererUrl?: string | undefined;
}

export interface TrustedRendererPolicy {
  readonly source: "dev-url" | "packaged-scheme";
  readonly initialUrl: string;
  readonly allowedRendererOrigin: string;
  readonly canNavigateInWindow: (url: string) => boolean;
}

const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const parseUrl = (value: string): URL | undefined => {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
};
export const isValidatedLoopbackDevUrl = (
  value: string | undefined,
): value is string => {
  if (!value) return false;
  const parsed = parseUrl(value);
  if (!parsed) return false;
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  if (!loopbackHosts.has(parsed.hostname)) return false;
  return parsed.username === "" && parsed.password === "";
};
export const createTrustedRendererPolicy = ({
  isDevelopment,
  rendererUrl,
}: RendererPolicyOptions): TrustedRendererPolicy => {
  if (isDevelopment && isValidatedLoopbackDevUrl(rendererUrl)) {
    const trusted = new URL(rendererUrl);
    return {
      source: "dev-url",
      initialUrl: trusted.toString(),
      allowedRendererOrigin: trusted.origin,
      canNavigateInWindow: (url) => parseUrl(url)?.origin === trusted.origin,
    };
  }
  return {
    source: "packaged-scheme",
    initialUrl: RENDERER_INDEX_URL,
    allowedRendererOrigin: RENDERER_ORIGIN,
    canNavigateInWindow: (url) => {
      const parsed = parseUrl(url);
      return parsed?.protocol === "spacezero:" && parsed.host === "renderer";
    },
  };
};
