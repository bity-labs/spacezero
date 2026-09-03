#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";

function parseArgs(argv) {
  const options = { metadata: "beta-linux.yml", arches: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "--dir") options.dir = argv[++i];
    else if (arg === "--version") options.version = argv[++i];
    else if (arg === "--arch") options.arches.push(argv[++i]);
    else if (arg === "--metadata") options.metadata = argv[++i];
    else throw new Error(`Unknown argument ${arg}`);
  }
  if (!options.dir) throw new Error("--dir is required");
  if (!options.version) throw new Error("--version is required");
  if (options.arches.length === 0) throw new Error("--arch is required");
  return options;
}

function ensureFile(path) {
  let stats;
  try {
    stats = statSync(path);
  } catch {
    throw new Error(`Missing artifact ${basename(path)}`);
  }
  if (!stats.isFile() || stats.size === 0) {
    throw new Error(`Artifact ${basename(path)} must be a non-empty file`);
  }
  return stats;
}

function cleanScalar(value) {
  return value.replace(/^["']|["']$/g, "");
}

function metadataFileEntries(metadata) {
  const entries = [];
  let current;
  for (const line of metadata.split(/\r?\n/)) {
    const url = /^\s*-\s+url:\s*(.+?)\s*$/.exec(line)?.[1];
    if (url) {
      current = { url: cleanScalar(url) };
      entries.push(current);
      continue;
    }
    if (!current) continue;
    const sha512 = /^\s+sha512:\s*(.+?)\s*$/.exec(line)?.[1];
    if (sha512) {
      current.sha512 = cleanScalar(sha512);
      continue;
    }
    const size = /^\s+size:\s*(\d+)\s*$/.exec(line)?.[1];
    if (size) current.size = Number(size);
  }
  return entries;
}

function metadataReferences(metadata) {
  const references = [];
  for (const line of metadata.split(/\r?\n/)) {
    const match = /^\s*(?:-\s+)?(?:url|path):\s*(.+?)\s*$/.exec(line);
    if (!match) continue;
    references.push(cleanScalar(match[1]));
  }
  return references;
}

function validateReferenceName(reference) {
  if (
    reference.startsWith("/") ||
    reference.includes("://") ||
    reference.split(/[\\/]+/).includes("..")
  ) {
    throw new Error(
      `Updater metadata must reference release asset filenames, not ${reference}`,
    );
  }
}

function sha512Base64(path) {
  return createHash("sha512").update(readFileSync(path)).digest("base64");
}

function artifactArchName(arch) {
  if (arch === "x64") return "x86_64";
  return arch;
}

try {
  const options = parseArgs(process.argv.slice(2));
  const metadata = readFileSync(join(options.dir, options.metadata), "utf8");
  if (!metadata.includes(`version: ${options.version}`)) {
    throw new Error(
      `${options.metadata} does not declare version ${options.version}`,
    );
  }

  const fileEntries = metadataFileEntries(metadata);
  if (fileEntries.length === 0) {
    throw new Error(`${options.metadata} does not reference any update assets`);
  }
  for (const entry of fileEntries) {
    validateReferenceName(entry.url);
    const artifactPath = join(options.dir, entry.url);
    const stats = ensureFile(artifactPath);
    if (!entry.url.endsWith(".AppImage")) continue;
    if (!entry.sha512 || typeof entry.size !== "number") {
      throw new Error(
        `${options.metadata} AppImage entries must include sha512 and size`,
      );
    }
    if (stats.size !== entry.size) {
      throw new Error(`${entry.url} size does not match ${options.metadata}`);
    }
    if (sha512Base64(artifactPath) !== entry.sha512) {
      throw new Error(`${entry.url} sha512 does not match ${options.metadata}`);
    }
  }

  const references = metadataReferences(metadata);
  for (const reference of references) validateReferenceName(reference);
  for (const arch of options.arches) {
    const base = `Space-Zero-${options.version}-${artifactArchName(arch)}`;
    if (!references.includes(`${base}.AppImage`)) {
      throw new Error(
        `${options.metadata} does not reference ${base}.AppImage`,
      );
    }
  }
  for (const reference of references) ensureFile(join(options.dir, reference));

  for (const arch of options.arches) {
    const base = `Space-Zero-${options.version}-${artifactArchName(arch)}`;
    ensureFile(join(options.dir, `${base}.AppImage`));
  }

  console.log("verified Linux release artifacts");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
