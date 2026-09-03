#!/usr/bin/env node
import { spawnSync } from "node:child_process";

function parseArch(argv) {
  const args = argv.filter((arg) => arg !== "--");
  const archFlag = args.find((arg) => arg === "--arm64" || arg === "--x64");
  if (archFlag) return archFlag.slice(2);
  const archIndex = args.indexOf("--arch");
  if (archIndex !== -1) return args[archIndex + 1];
  throw new Error("one architecture is required: --arm64 or --x64");
}

try {
  const arch = parseArch(process.argv.slice(2));
  if (arch !== "arm64" && arch !== "x64") {
    throw new Error("architecture must be arm64 or x64");
  }
  const result = spawnSync(
    "pnpm",
    [
      "--dir",
      "apps/desktop",
      "exec",
      "electron-builder",
      "--config",
      "electron-builder.yml",
      "--mac",
      `--${arch}`,
      "--publish",
      "never",
    ],
    { stdio: "inherit" },
  );
  process.exit(result.status ?? 1);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
