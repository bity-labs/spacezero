import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: resolve(__dirname, "src/main/index.ts") },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, "src/preload/index.ts"),
        output: { format: "cjs", entryFileNames: "index.js" },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    plugins: [
      tanstackRouter({
        target: "react",
        routesDirectory: resolve(__dirname, "src/renderer/routes"),
        generatedRouteTree: resolve(__dirname, "src/renderer/routeTree.gen.ts"),
      }),
      react(),
      tailwindcss(),
    ],
  },
});
