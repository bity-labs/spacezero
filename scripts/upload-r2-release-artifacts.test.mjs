import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptPath = join(
  process.cwd(),
  "scripts/upload-r2-release-artifacts.mjs",
);

function makeFixture() {
  const dir = mkdtempSync(join(tmpdir(), "spacezero-r2-upload-"));
  const artifacts = join(dir, "release-artifacts");
  const bin = join(dir, "bin");
  const log = join(dir, "aws-args.jsonl");
  mkdirSync(artifacts);
  mkdirSync(bin);
  writeFileSync(join(artifacts, "beta-mac.yml"), "version: 0.1.0-beta.11\n");
  writeFileSync(
    join(bin, "aws"),
    `#!/usr/bin/env node\nconst fs = require('node:fs');\nfs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + '\\n');\n`,
    { mode: 0o755 },
  );
  return { artifacts, bin, log };
}

function runUpload(args, env = {}) {
  return spawnSync(process.execPath, [scriptPath, "--", ...args], {
    env: {
      ...process.env,
      AWS_ACCESS_KEY_ID: "test-access-key",
      AWS_SECRET_ACCESS_KEY: "test-secret-key",
      ...env,
    },
    encoding: "utf8",
  });
}

test("uploads immutable versioned artifacts and short-cached beta channel artifacts to R2", () => {
  const { artifacts, bin, log } = makeFixture();
  const result = runUpload(
    [
      "--dir",
      artifacts,
      "--bucket",
      "spacezero-downloads",
      "--account-id",
      "account-id",
      "--prefix",
      "/spacezero/",
      "--tag",
      "v0.1.0-beta.11",
    ],
    { PATH: `${bin}${delimiter}${process.env.PATH}` },
  );

  assert.equal(result.status, 0, result.stderr);
  const calls = readFileSync(log, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(calls, [
    [
      "s3",
      "sync",
      artifacts,
      "s3://spacezero-downloads/spacezero/macos/releases/v0.1.0-beta.11",
      "--delete",
      "--cache-control",
      "public,max-age=31536000,immutable",
      "--endpoint-url",
      "https://account-id.r2.cloudflarestorage.com",
      "--no-progress",
    ],
    [
      "s3",
      "sync",
      artifacts,
      "s3://spacezero-downloads/spacezero/macos/beta",
      "--delete",
      "--cache-control",
      "public,max-age=300",
      "--endpoint-url",
      "https://account-id.r2.cloudflarestorage.com",
      "--no-progress",
    ],
  ]);
  assert.match(
    result.stdout,
    /uploaded macos beta artifacts to s3:\/\/spacezero-downloads\/spacezero\/macos\/beta/,
  );
});

test("uploads Linux artifacts to Linux R2 prefixes", () => {
  const { artifacts, bin, log } = makeFixture();
  const result = runUpload(
    [
      "--dir",
      artifacts,
      "--bucket",
      "spacezero-downloads",
      "--account-id",
      "account-id",
      "--prefix",
      "spacezero",
      "--tag",
      "v0.1.0-beta.11",
      "--platform",
      "linux",
    ],
    { PATH: `${bin}${delimiter}${process.env.PATH}` },
  );

  assert.equal(result.status, 0, result.stderr);
  const calls = readFileSync(log, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(
    calls[0][3],
    "s3://spacezero-downloads/spacezero/linux/releases/v0.1.0-beta.11",
  );
  assert.equal(calls[1][3], "s3://spacezero-downloads/spacezero/linux/beta");
});

test("rejects missing R2 upload credentials", () => {
  const { artifacts, bin } = makeFixture();
  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      "--",
      "--dir",
      artifacts,
      "--bucket",
      "spacezero-downloads",
      "--account-id",
      "account-id",
      "--tag",
      "v0.1.0-beta.11",
    ],
    {
      env: {
        ...process.env,
        PATH: `${bin}${delimiter}${process.env.PATH}`,
        AWS_ACCESS_KEY_ID: "",
        AWS_SECRET_ACCESS_KEY: "",
      },
      encoding: "utf8",
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /AWS_ACCESS_KEY_ID environment variable is required/,
  );
});
