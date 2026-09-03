#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";

function parseArgs(argv) {
  const args = argv.filter((arg) => arg !== "--");
  const parsed = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      throw new Error(`unexpected argument: ${arg}`);
    }
    const name = arg.slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`missing value for --${name}`);
    }
    parsed.set(name, value);
    index += 1;
  }
  return parsed;
}

function requiredArg(args, name) {
  const value = args.get(name)?.trim();
  if (!value) {
    throw new Error(`--${name} is required`);
  }
  return value;
}

function requiredEnv(name) {
  if (!process.env[name]) {
    throw new Error(`${name} environment variable is required`);
  }
}

function normalizePrefix(prefix) {
  return prefix
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");
}

function joinKey(...parts) {
  return normalizePrefix(parts.filter(Boolean).join("/"));
}

function s3Uri(bucket, prefix) {
  return prefix ? `s3://${bucket}/${prefix}` : `s3://${bucket}`;
}

function ensureArtifactDirectory(dir) {
  const stat = statSync(dir, { throwIfNoEntry: false });
  if (!stat?.isDirectory()) {
    throw new Error(`artifact directory does not exist: ${dir}`);
  }
  const files = readdirSync(dir).filter((entry) =>
    statSync(`${dir}/${entry}`).isFile(),
  );
  if (files.length === 0) {
    throw new Error(`artifact directory is empty: ${dir}`);
  }
}

function runAws(args) {
  const result = spawnSync("aws", args, {
    stdio: "inherit",
    env: { ...process.env, AWS_EC2_METADATA_DISABLED: "true" },
  });
  if (result.error) {
    throw result.error.code === "ENOENT"
      ? new Error("aws CLI is required to upload release artifacts to R2")
      : result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  const dir = requiredArg(args, "dir");
  const bucket = requiredArg(args, "bucket");
  const accountId = requiredArg(args, "account-id");
  const tag = requiredArg(args, "tag");
  const rootPrefix = normalizePrefix(args.get("prefix") ?? "");

  if (bucket.includes("/")) {
    throw new Error("--bucket must be a bucket name, not a path");
  }
  if (tag.includes("/")) {
    throw new Error("--tag must not contain slashes");
  }

  requiredEnv("AWS_ACCESS_KEY_ID");
  requiredEnv("AWS_SECRET_ACCESS_KEY");
  ensureArtifactDirectory(dir);

  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  const channelPrefix = joinKey(rootPrefix, "macos", "beta");
  const versionPrefix = joinKey(rootPrefix, "macos", "releases", tag);
  const baseAwsArgs = ["--endpoint-url", endpoint, "--no-progress"];

  runAws([
    "s3",
    "sync",
    dir,
    s3Uri(bucket, versionPrefix),
    "--delete",
    "--cache-control",
    "public,max-age=31536000,immutable",
    ...baseAwsArgs,
  ]);
  runAws([
    "s3",
    "sync",
    dir,
    s3Uri(bucket, channelPrefix),
    "--delete",
    "--cache-control",
    "public,max-age=300",
    ...baseAwsArgs,
  ]);

  console.log(
    `uploaded macOS beta artifacts to ${s3Uri(bucket, channelPrefix)} and ${s3Uri(bucket, versionPrefix)}`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
