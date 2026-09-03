import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptPath = join(process.cwd(), "scripts/package-linux-ci.mjs");

function makeBin() {
  const dir = mkdtempSync(join(tmpdir(), "spacezero-package-linux-ci-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const log = join(dir, "args.json");
  writeFileSync(
    join(bin, "pnpm"),
    `#!/usr/bin/env node\nconst fs = require('node:fs');\nfs.writeFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)));\n`,
    { mode: 0o755 },
  );
  return { bin, log };
}

test("passes the requested Linux x64 architecture to Electron Builder", () => {
  const { bin, log } = makeBin();
  const result = spawnSync(process.execPath, [scriptPath, "--", "--x64"], {
    env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const args = JSON.parse(readFileSync(log, "utf8"));
  assert.deepEqual(args, [
    "--dir",
    "apps/desktop",
    "exec",
    "electron-builder",
    "--config",
    "electron-builder.yml",
    "--linux",
    "--x64",
    "--publish",
    "never",
  ]);
  assert.equal(args.includes("--mac"), false);
});

test("rejects missing Linux architecture", () => {
  const result = spawnSync(process.execPath, [scriptPath], {
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /one Linux architecture is required/);
});

test("rejects unsupported Linux architectures", () => {
  const result = spawnSync(process.execPath, [scriptPath, "--arch", "arm64"], {
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Linux architecture must be x64/);
});
