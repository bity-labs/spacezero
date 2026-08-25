import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const checkerPath = join(process.cwd(), "scripts/check-boundaries.mjs");

function makeRepo(mutator) {
  const dir = mkdtempSync(join(tmpdir(), "spacezero-boundaries-"));
  for (const path of [
    "scripts",
    "apps/desktop",
    "apps/workspace-host",
    "apps/handbook",
    "packages/host-contracts",
    "packages/client-runtime",
    "packages/pi-adapter",
    "packages/ui",
  ])
    mkdirSync(join(dir, path), { recursive: true });
  cpSync(
    "scripts/check-boundaries.mjs",
    join(dir, "scripts/check-boundaries.mjs"),
  );
  cpSync(
    "scripts/workspace-boundaries.mjs",
    join(dir, "scripts/workspace-boundaries.mjs"),
  );
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      type: "module",
      devDependencies: {
        "@playwright/test": "1.62.1",
        typescript: "6.0.3",
        vitest: "4.1.10",
      },
    }),
  );
  const manifests = {
    "apps/desktop/package.json": {
      name: "@spacezero/desktop",
      type: "module",
      dependencies: { "@spacezero/client-runtime": "workspace:*" },
    },
    "apps/workspace-host/package.json": {
      name: "@spacezero/workspace-host",
      type: "module",
      dependencies: { "@spacezero/host-contracts": "workspace:*" },
    },
    "apps/handbook/package.json": {
      name: "@spacezero/handbook",
      type: "module",
      dependencies: {},
    },
    "packages/host-contracts/package.json": {
      name: "@spacezero/host-contracts",
      type: "module",
      exports: {},
    },
    "packages/client-runtime/package.json": {
      name: "@spacezero/client-runtime",
      type: "module",
      exports: {},
      dependencies: { "@spacezero/host-contracts": "workspace:*" },
    },
    "packages/pi-adapter/package.json": {
      name: "@spacezero/pi-adapter",
      type: "module",
      exports: {},
    },
    "packages/ui/package.json": {
      name: "@spacezero/ui",
      type: "module",
      exports: {},
      peerDependencies: { react: "19.2.8", "react-dom": "19.2.8" },
      devDependencies: {
        react: "19.2.8",
        "react-dom": "19.2.8",
        "@types/react": "19.2.18",
        "@types/react-dom": "19.2.4",
      },
    },
  };
  for (const [path, data] of Object.entries(manifests))
    writeFileSync(join(dir, path), JSON.stringify(data));
  mutator?.(dir);
  return dir;
}
function run(dir) {
  return spawnSync(process.execPath, [checkerPath], {
    cwd: dir,
    encoding: "utf8",
  });
}

function writeJson(dir, path, data) {
  writeFileSync(join(dir, path), JSON.stringify(data));
}

test("accepted graph passes", () => assert.equal(run(makeRepo()).status, 0));
test("rejects packages importing apps", () => {
  const result = run(
    makeRepo((dir) => {
      mkdirSync(join(dir, "packages/client-runtime/src"));
      writeFileSync(
        join(dir, "packages/client-runtime/src/x.ts"),
        'import "@spacezero/desktop";',
      );
    }),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /may not import/);
});
test("rejects browser-safe Node imports", () => {
  const result = run(
    makeRepo((dir) => {
      mkdirSync(join(dir, "packages/host-contracts/src"));
      writeFileSync(
        join(dir, "packages/host-contracts/src/x.ts"),
        'import "node:fs";',
      );
    }),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /browser-safe/);
});
test("rejects deep src imports", () => {
  const result = run(
    makeRepo((dir) => {
      mkdirSync(join(dir, "apps/desktop/src/main"), { recursive: true });
      writeFileSync(
        join(dir, "apps/desktop/src/main/x.ts"),
        'import "@spacezero/client-runtime/src/index.js";',
      );
    }),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /deep source/);
});
test("allows react peer and dev dependencies for the active ui package", () => {
  const result = run(makeRepo());
  assert.equal(result.status, 0, result.stderr);
});
test("rejects version ranges", () => {
  const result = run(
    makeRepo((dir) => {
      writeJson(dir, "packages/host-contracts/package.json", {
        name: "@spacezero/host-contracts",
        type: "module",
        exports: {},
        dependencies: { effect: "^4.0.0" },
      });
    }),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /exact/);
});

test("rejects workspace protocol for external packages", () => {
  const result = run(
    makeRepo((dir) => {
      writeJson(dir, "packages/host-contracts/package.json", {
        name: "@spacezero/host-contracts",
        type: "module",
        exports: {},
        dependencies: { electron: "workspace:*" },
      });
    }),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /workspace:\* is only allowed/);
});

test("rejects forbidden browser-safe manifest dependencies", () => {
  const result = run(
    makeRepo((dir) => {
      writeJson(dir, "packages/client-runtime/package.json", {
        name: "@spacezero/client-runtime",
        type: "module",
        exports: {},
        dependencies: {
          "@spacezero/host-contracts": "workspace:*",
          electron: "43.4.0",
          react: "19.2.8",
          "@effect/sql-sqlite-node": "4.0.0-rc.109",
          "@spacezero/pi-adapter": "workspace:*",
        },
      });
    }),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /browser-safe dependency electron is forbidden/);
  assert.match(result.stderr, /browser-safe dependency react is forbidden/);
  assert.match(
    result.stderr,
    /browser-safe dependency @effect\/sql-sqlite-node is forbidden/,
  );
  assert.match(
    result.stderr,
    /undeclared\/forbidden workspace dependency @spacezero\/pi-adapter/,
  );
});

test("rejects cross-app relative imports", () => {
  const result = run(
    makeRepo((dir) => {
      mkdirSync(join(dir, "apps/desktop/src/main"), { recursive: true });
      mkdirSync(join(dir, "apps/workspace-host/src"), { recursive: true });
      writeFileSync(
        join(dir, "apps/workspace-host/src/main.ts"),
        "export {};\n",
      );
      writeFileSync(
        join(dir, "apps/desktop/src/main/x.ts"),
        'import "../../../workspace-host/src/main.js";',
      );
    }),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /relative import crosses workspace boundary/);
});

test("rejects relative deep source imports across packages", () => {
  const result = run(
    makeRepo((dir) => {
      mkdirSync(join(dir, "packages/client-runtime/src"), { recursive: true });
      mkdirSync(join(dir, "packages/host-contracts/src"), { recursive: true });
      writeFileSync(
        join(dir, "packages/host-contracts/src/index.ts"),
        "export {};\n",
      );
      writeFileSync(
        join(dir, "packages/client-runtime/src/x.ts"),
        'import "../../host-contracts/src/index.js";',
      );
    }),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /relative import crosses workspace boundary/);
});

test("rejects Desktop renderer to preload relative imports", () => {
  const result = run(
    makeRepo((dir) => {
      mkdirSync(join(dir, "apps/desktop/src/renderer"), { recursive: true });
      mkdirSync(join(dir, "apps/desktop/src/preload"), { recursive: true });
      writeFileSync(
        join(dir, "apps/desktop/src/preload/secret.ts"),
        "export {};\n",
      );
      writeFileSync(
        join(dir, "apps/desktop/src/renderer/x.ts"),
        'import "../preload/secret.js";',
      );
    }),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /process surface/);
});

test("rejects Desktop main imports of ui package", () => {
  const result = run(
    makeRepo((dir) => {
      writeJson(dir, "apps/desktop/package.json", {
        name: "@spacezero/desktop",
        type: "module",
        dependencies: {
          "@spacezero/client-runtime": "workspace:*",
          "@spacezero/ui": "workspace:*",
        },
      });
      mkdirSync(join(dir, "apps/desktop/src/main"), { recursive: true });
      writeFileSync(
        join(dir, "apps/desktop/src/main/x.ts"),
        'import "@spacezero/ui";',
      );
    }),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Desktop renderer/);
});

test("allows Desktop renderer imports of ui package", () => {
  const result = run(
    makeRepo((dir) => {
      writeJson(dir, "apps/desktop/package.json", {
        name: "@spacezero/desktop",
        type: "module",
        dependencies: {
          "@spacezero/client-runtime": "workspace:*",
          "@spacezero/ui": "workspace:*",
        },
      });
      mkdirSync(join(dir, "apps/desktop/src/renderer"), { recursive: true });
      writeFileSync(
        join(dir, "apps/desktop/src/renderer/x.ts"),
        'import "@spacezero/ui";',
      );
    }),
  );
  assert.equal(result.status, 0, result.stderr);
});

test("rejects Desktop renderer to main relative imports", () => {
  const result = run(
    makeRepo((dir) => {
      mkdirSync(join(dir, "apps/desktop/src/renderer"), { recursive: true });
      mkdirSync(join(dir, "apps/desktop/src/main"), { recursive: true });
      writeFileSync(
        join(dir, "apps/desktop/src/main/secret.ts"),
        "export {};\n",
      );
      writeFileSync(
        join(dir, "apps/desktop/src/renderer/x.ts"),
        'import "../main/secret.js";',
      );
    }),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /process surface/);
});

test("rejects Desktop preload to main relative imports", () => {
  const result = run(
    makeRepo((dir) => {
      mkdirSync(join(dir, "apps/desktop/src/preload"), { recursive: true });
      mkdirSync(join(dir, "apps/desktop/src/main"), { recursive: true });
      writeFileSync(
        join(dir, "apps/desktop/src/main/secret.ts"),
        "export {};\n",
      );
      writeFileSync(
        join(dir, "apps/desktop/src/preload/x.ts"),
        'import "../main/secret.js";',
      );
    }),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /process surface/);
});

test("rejects Desktop main to renderer and preload relative imports", () => {
  const result = run(
    makeRepo((dir) => {
      mkdirSync(join(dir, "apps/desktop/src/main"), { recursive: true });
      mkdirSync(join(dir, "apps/desktop/src/renderer"), { recursive: true });
      mkdirSync(join(dir, "apps/desktop/src/preload"), { recursive: true });
      writeFileSync(
        join(dir, "apps/desktop/src/renderer/view.ts"),
        "export {};\n",
      );
      writeFileSync(
        join(dir, "apps/desktop/src/preload/bridge.ts"),
        "export {};\n",
      );
      writeFileSync(
        join(dir, "apps/desktop/src/main/x.ts"),
        'import "../renderer/view.js";\nimport "../preload/bridge.js";',
      );
    }),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /process surface/);
});

test("rejects Desktop surface imports into unclassified Desktop paths", () => {
  const result = run(
    makeRepo((dir) => {
      mkdirSync(join(dir, "apps/desktop/src/renderer"), { recursive: true });
      writeFileSync(
        join(dir, "apps/desktop/electron.vite.config.ts"),
        "export {};\n",
      );
      writeFileSync(
        join(dir, "apps/desktop/src/renderer/x.ts"),
        'import "../../electron.vite.config.js";',
      );
    }),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unclassified Desktop path/);
});

test("rejects directory-form imports across Desktop surfaces", () => {
  const result = run(
    makeRepo((dir) => {
      mkdirSync(join(dir, "apps/desktop/src/renderer"), { recursive: true });
      mkdirSync(join(dir, "apps/desktop/src/preload"), { recursive: true });
      writeFileSync(
        join(dir, "apps/desktop/src/preload/index.ts"),
        "export {};\n",
      );
      writeFileSync(
        join(dir, "apps/desktop/src/renderer/x.ts"),
        'import "../preload";',
      );
    }),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /renderer process surface for preload/);
});

test("rejects bare Node builtins in browser-safe packages", () => {
  const result = run(
    makeRepo((dir) => {
      mkdirSync(join(dir, "packages/host-contracts/src"));
      writeFileSync(
        join(dir, "packages/host-contracts/src/x.ts"),
        'import "fs/promises";',
      );
    }),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /browser-safe/);
});

test("rejects bare Node builtins in Desktop renderer", () => {
  const result = run(
    makeRepo((dir) => {
      mkdirSync(join(dir, "apps/desktop/src/renderer"), { recursive: true });
      writeFileSync(
        join(dir, "apps/desktop/src/renderer/x.ts"),
        'import "path";',
      );
    }),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /browser-safe/);
});

test("rejects undeclared external imports from workspace source", () => {
  const result = run(
    makeRepo((dir) => {
      mkdirSync(join(dir, "apps/workspace-host/src"));
      writeFileSync(
        join(dir, "apps/workspace-host/src/x.ts"),
        'import "typescript";',
      );
    }),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must be declared/);
});

test("rejects allowed but undeclared workspace imports from workspace source", () => {
  const result = run(
    makeRepo((dir) => {
      mkdirSync(join(dir, "apps/desktop/src/main"), { recursive: true });
      writeFileSync(
        join(dir, "apps/desktop/src/main/x.ts"),
        'import "@spacezero/host-contracts";',
      );
    }),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must be declared/);
});

test("rejects require calls in strict ESM workspace source", () => {
  const result = run(
    makeRepo((dir) => {
      mkdirSync(join(dir, "apps/workspace-host/src"));
      writeFileSync(
        join(dir, "apps/workspace-host/src/x.ts"),
        'require("effect");',
      );
    }),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /require\(\) is forbidden/);
});

test("rejects non-literal dynamic imports", () => {
  const result = run(
    makeRepo((dir) => {
      mkdirSync(join(dir, "apps/workspace-host/src"));
      writeFileSync(
        join(dir, "apps/workspace-host/src/x.ts"),
        "import(process.env.MODULE_NAME);",
      );
    }),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /non-literal dynamic import/);
});

test("allows root dev tooling imports from explicit test and config files", () => {
  const result = run(
    makeRepo((dir) => {
      mkdirSync(join(dir, "apps/desktop/src/renderer"), { recursive: true });
      writeFileSync(
        join(dir, "apps/desktop/src/renderer/app.test.tsx"),
        'import "vitest";',
      );
      writeFileSync(
        join(dir, "apps/desktop/playwright.config.ts"),
        'import "@playwright/test";',
      );
    }),
  );
  assert.equal(result.status, 0, result.stderr);
});
