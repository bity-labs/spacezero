import { protocol, net } from "electron";
import { existsSync, realpathSync, statSync } from "node:fs";
import { join, normalize, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const RENDERER_ORIGIN = "spacezero://renderer";
export const RENDERER_INDEX_URL = `${RENDERER_ORIGIN}/index.html`;
export const registerRendererSchemePrivilege = (): void => {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: "spacezero",
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
      },
    },
  ]);
};
export const rendererCsp = (hostEndpoint?: string): string => {
  const protocol = hostEndpoint ? new URL(hostEndpoint).protocol : "http:";
  const connect = `connect-src 'self' ${protocol}//127.0.0.1:*;`;
  return `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; ${connect}`;
};
export const resolveRendererAssetPath = (
  root: string,
  url: string,
): string | undefined => {
  let parsed: URL;
  let decoded: string;
  try {
    parsed = new URL(url);
    if (parsed.protocol !== "spacezero:" || parsed.host !== "renderer")
      return undefined;
    decoded = decodeURIComponent(
      parsed.pathname === "/" ? "/index.html" : parsed.pathname,
    );
  } catch {
    return undefined;
  }
  if (
    decoded.includes("\0") ||
    decoded.includes("\\") ||
    decoded.split("/").includes("..")
  )
    return undefined;
  const canonicalRoot = realpathSync(root);
  const target = resolve(canonicalRoot, `.${normalize(decoded)}`);
  if (!existsSync(target)) return undefined;
  const realTarget = realpathSync(target);
  const rel = relative(canonicalRoot, realTarget);
  if (rel.startsWith("..") || rel === "" || rel.includes(".."))
    return undefined;
  return statSync(realTarget).isFile() ? realTarget : undefined;
};
export const registerRendererProtocol = (
  root: string,
  hostEndpoint?: string,
): void => {
  protocol.handle("spacezero", (request: Request) => {
    if (request.method !== "GET")
      return new Response("forbidden", { status: 403 });
    const file = resolveRendererAssetPath(root, request.url);
    if (!file) return new Response("not found", { status: 404 });
    const headers = file.endsWith(".html")
      ? { "content-security-policy": rendererCsp(hostEndpoint) }
      : undefined;
    return net.fetch(pathToFileURL(file).toString()).then(
      async (response) =>
        new Response(response.body, {
          status: response.status,
          headers: { ...Object.fromEntries(response.headers), ...headers },
        }),
    );
  });
};
export const builtRendererRoot = (mainDir: string): string =>
  join(mainDir, "../renderer");
