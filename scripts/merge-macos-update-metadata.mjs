#!/usr/bin/env node
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function parseArgs(argv) {
  const options = { arches: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dir") options.dir = argv[++i];
    else if (arg === "--version") options.version = argv[++i];
    else if (arg === "--arch") options.arches.push(argv[++i]);
    else if (arg === "--out") options.out = argv[++i];
    else throw new Error(`Unknown argument ${arg}`);
  }
  if (!options.dir) throw new Error("--dir is required");
  if (!options.version) throw new Error("--version is required");
  if (options.arches.length === 0) options.arches = ["x64", "arm64"];
  if (options.arches.length < 2) {
    throw new Error("At least two architecture manifests are required");
  }
  options.out ??= "beta-mac.yml";
  return options;
}

function scalar(metadata, key) {
  const match = new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m").exec(metadata);
  return match?.[1]?.replace(/^['"]|['"]$/g, "");
}

function firstFileEntry(metadata) {
  const url = /^\s+-\s+url:\s*(.+?)\s*$/m.exec(metadata)?.[1];
  const sha512 = /^\s+sha512:\s*(.+?)\s*$/m.exec(metadata)?.[1];
  const size = /^\s+size:\s*(\d+)\s*$/m.exec(metadata)?.[1];
  return {
    url: url?.replace(/^['"]|['"]$/g, ""),
    sha512: sha512?.replace(/^['"]|['"]$/g, ""),
    size,
  };
}

try {
  const options = parseArgs(process.argv.slice(2));
  const entries = [];
  let releaseDate;
  for (const arch of options.arches) {
    const manifestPath = join(options.dir, `beta-mac-${arch}.yml`);
    const metadata = readFileSync(manifestPath, "utf8");
    const version = scalar(metadata, "version");
    if (version !== options.version) {
      throw new Error(
        `${manifestPath} version ${version ?? "<missing>"} does not match ${options.version}`,
      );
    }
    const entry = firstFileEntry(metadata);
    if (!entry.url || !entry.sha512) {
      throw new Error(`${manifestPath} must contain a file url and sha512`);
    }
    if (
      entry.url.startsWith("/") ||
      entry.url.includes("://") ||
      entry.url.includes("..")
    ) {
      throw new Error(`${manifestPath} must reference release asset filenames`);
    }
    const zipPath = join(options.dir, entry.url);
    const size = entry.size ?? String(statSync(zipPath).size);
    entries.push({ arch, url: entry.url, sha512: entry.sha512, size });
    releaseDate ??= scalar(metadata, "releaseDate");
  }

  entries.sort((left, right) => {
    const order = new Map([
      ["x64", 0],
      ["arm64", 1],
    ]);
    return (order.get(left.arch) ?? 99) - (order.get(right.arch) ?? 99);
  });

  const fallback = entries[0];
  const date = releaseDate ?? new Date().toISOString();
  const files = entries
    .map(
      (entry) =>
        `  - url: ${entry.url}\n    sha512: ${entry.sha512}\n    size: ${entry.size}`,
    )
    .join("\n");
  writeFileSync(
    join(options.dir, options.out),
    `version: ${options.version}\nfiles:\n${files}\npath: ${fallback.url}\nsha512: ${fallback.sha512}\nreleaseDate: '${date}'\n`,
  );
  console.log("merged macOS update metadata");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
