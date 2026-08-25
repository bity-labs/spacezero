import { builtinModules } from "node:module";
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const nodeBuiltinImportPatterns = [
  "node:*",
  ...new Set(
    builtinModules
      .map((name) => {
        const bareName = name.replace(/^node:/, "").split("/")[0];
        return [bareName, `${bareName}/*`];
      })
      .flat(),
  ),
];

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/out/**",
      "**/.next/**",
      "apps/handbook/.source/**",
      "node_modules/**",
      ".pi-subagents/**",
      ".agent-runs/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mts,mjs}"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module" },
    rules: { "@typescript-eslint/consistent-type-imports": "error" },
  },
  {
    files: [
      "apps/workspace-host/**/*.ts",
      "apps/desktop/src/main/**/*.ts",
      "apps/desktop/src/preload/**/*.ts",
      "packages/pi-adapter/test/**/*.mjs",
      "scripts/**/*.mjs",
    ],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: [
      "apps/desktop/src/renderer/**/*.{ts,tsx}",
      "apps/handbook/**/*.{ts,tsx}",
      "packages/host-contracts/src/**/*.ts",
      "packages/client-runtime/src/**/*.ts",
      "packages/ui/src/**/*.{ts,tsx}",
    ],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...nodeBuiltinImportPatterns,
            "electron",
            "@effect/*",
            "@spacezero/workspace-host",
            "@spacezero/pi-adapter",
          ],
        },
      ],
    },
  },
  {
    files: ["packages/client-runtime/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "node:*",
            "electron",
            "@effect/*",
            "@spacezero/workspace-host",
            "@spacezero/pi-adapter",
          ],
        },
      ],
    },
  },
  {
    files: [
      "apps/desktop/src/renderer/**/*.{tsx,ts}",
      "apps/handbook/**/*.{tsx,ts}",
      "packages/ui/src/**/*.{tsx,ts}",
    ],
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": "off",
    },
  },
);
