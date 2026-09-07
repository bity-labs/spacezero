const debugFlagKeys = [
  "spacezero:debug:host-calls",
  "spacezero.debugHostCalls",
] as const;

const isHostCallDebugEnabled = (): boolean => {
  const global = globalThis as typeof globalThis & {
    readonly __SPACEZERO_DEBUG_HOST_CALLS__?: unknown;
  };
  if (global.__SPACEZERO_DEBUG_HOST_CALLS__ === true) return true;
  try {
    return debugFlagKeys.some(
      (key) => globalThis.localStorage?.getItem(key) === "1",
    );
  } catch {
    return false;
  }
};

const requestMethod = (input: RequestInfo | URL, init?: RequestInit): string => {
  if (init?.method) return init.method.toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return "GET";
};

const requestPath = (input: RequestInfo | URL): string => {
  const rawUrl = input instanceof Request ? input.url : String(input);
  try {
    const url = new URL(rawUrl);
    return url.pathname;
  } catch {
    return "<unknown>";
  }
};

export const withHostCallDebugLogging = (
  fetchImpl: typeof globalThis.fetch,
): typeof globalThis.fetch => {
  const loggedFetch: typeof globalThis.fetch = async (input, init) => {
    if (!isHostCallDebugEnabled()) return fetchImpl(input, init);
    const method = requestMethod(input, init);
    const path = requestPath(input);
    const startedAt = performance.now();
    console.debug("[spacezero:host] request", { method, path });
    try {
      const response = await fetchImpl(input, init);
      console.debug("[spacezero:host] response", {
        method,
        path,
        status: response.status,
        durationMs: Math.round(performance.now() - startedAt),
      });
      return response;
    } catch (error) {
      console.debug("[spacezero:host] error", {
        method,
        path,
        durationMs: Math.round(performance.now() - startedAt),
        error,
      });
      throw error;
    }
  };
  return loggedFetch;
};
