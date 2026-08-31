import { createHashHistory, createRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen.js";

/**
 * Hash history keeps routing inside the custom `spacezero://renderer`
 * protocol, where path-based history has no server to fall back to.
 */
export const router = createRouter({
  history: createHashHistory(),
  routeTree,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
