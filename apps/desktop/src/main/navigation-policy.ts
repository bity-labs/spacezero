import { pathToFileURL } from "node:url";

export interface RendererPolicyOptions {
  readonly isDevelopment: boolean;
  readonly rendererUrl?: string | undefined;
  readonly packagedRendererPath: string;
}

export interface TrustedRendererPolicy {
  readonly source: "dev-url" | "packaged-file";
  readonly initialUrl: string;
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
  packagedRendererPath,
}: RendererPolicyOptions): TrustedRendererPolicy => {
  if (isDevelopment && isValidatedLoopbackDevUrl(rendererUrl)) {
    const trusted = new URL(rendererUrl);
    return {
      source: "dev-url",
      initialUrl: trusted.toString(),
      canNavigateInWindow: (url) => {
        const parsed = parseUrl(url);
        return parsed?.origin === trusted.origin;
      },
    };
  }

  const trusted = pathToFileURL(packagedRendererPath).toString();
  return {
    source: "packaged-file",
    initialUrl: trusted,
    canNavigateInWindow: (url) => url === trusted,
  };
};
