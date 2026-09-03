#!/usr/bin/env node
import { statSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "--dir") options.dir = argv[++i];
    else if (arg === "--version") options.version = argv[++i];
    else if (arg === "--arch") options.arch = argv[++i];
    else throw new Error(`Unknown argument ${arg}`);
  }
  if (!options.dir) throw new Error("--dir is required");
  if (!options.version) throw new Error("--version is required");
  if (!options.arch) throw new Error("--arch is required");
  return options;
}

function requireEnv(name) {
  const value = process.env[name] ?? "";
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function ensureDmg(path) {
  let stats;
  try {
    stats = statSync(path);
  } catch {
    throw new Error(`Missing DMG artifact ${basename(path)}`);
  }
  if (!stats.isFile() || stats.size === 0) {
    throw new Error(`DMG artifact ${basename(path)} must be a non-empty file`);
  }
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args[0] ?? ""} failed\n${result.stderr || result.stdout}`,
    );
  }
}

try {
  const options = parseArgs(process.argv.slice(2));
  const apiKeyPath = requireEnv("APPLE_API_KEY");
  const apiKeyId = requireEnv("APPLE_API_KEY_ID");
  const issuer = requireEnv("APPLE_API_ISSUER");
  const dmgPath = join(
    options.dir,
    `Space-Zero-${options.version}-${options.arch}.dmg`,
  );
  ensureDmg(dmgPath);
  run("xcrun", [
    "notarytool",
    "submit",
    dmgPath,
    "--wait",
    "--key",
    apiKeyPath,
    "--key-id",
    apiKeyId,
    "--issuer",
    issuer,
  ]);
  run("xcrun", ["stapler", "staple", dmgPath]);
  console.log("notarized and stapled macOS DMG");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
