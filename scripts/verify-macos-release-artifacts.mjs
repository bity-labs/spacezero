#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

function parseArgs(argv) {
  const options = {
    arches: [],
    metadata: "beta-mac.yml",
    requireMacosTrust: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "--dir") options.dir = argv[++i];
    else if (arg === "--version") options.version = argv[++i];
    else if (arg === "--arch") options.arches.push(argv[++i]);
    else if (arg === "--metadata") options.metadata = argv[++i];
    else if (arg === "--require-macos-trust") options.requireMacosTrust = true;
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
}

function cleanScalar(value) {
  return value.replace(/^['"]|['"]$/g, "");
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
    const match = /^\s*(?:url|path):\s*(.+?)\s*$/.exec(line);
    if (!match) continue;
    references.push(cleanScalar(match[1]));
  }
  return references;
}

function sha512Base64(path) {
  return createHash("sha512").update(readFileSync(path)).digest("base64");
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

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed\n${result.stderr || result.stdout}`,
    );
  }
}

function findExtractedApp(dir) {
  const apps = readdirSync(dir).filter((name) => name.endsWith(".app"));
  if (apps.length !== 1) {
    throw new Error(
      `Expected one extracted .app in ${dir}; found ${apps.length}`,
    );
  }
  return join(dir, apps[0]);
}

function verifyAppTrust(appPath) {
  run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
  run("spctl", ["--assess", "--type", "execute", "--verbose=4", appPath]);
  run("xcrun", ["stapler", "validate", appPath]);
}

function verifyZipTrust(zipPath) {
  const extractDir = mkdtempSync(join(tmpdir(), "spacezero-zip-"));
  try {
    run("ditto", ["-x", "-k", zipPath, extractDir]);
    verifyAppTrust(findExtractedApp(extractDir));
  } finally {
    rmSync(extractDir, { recursive: true, force: true });
  }
}

function verifyDmgTrust(dmgPath) {
  run("xcrun", ["stapler", "validate", dmgPath]);
  run("spctl", ["--assess", "--type", "open", "--verbose=4", dmgPath]);
  const mountDir = mkdtempSync(join(tmpdir(), "spacezero-dmg-"));
  try {
    run("hdiutil", [
      "attach",
      dmgPath,
      "-readonly",
      "-nobrowse",
      "-mountpoint",
      mountDir,
    ]);
    verifyAppTrust(findExtractedApp(mountDir));
  } finally {
    spawnSync("hdiutil", ["detach", mountDir, "-quiet"], { encoding: "utf8" });
    rmSync(mountDir, { recursive: true, force: true });
  }
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
    ensureFile(artifactPath);
    if (!entry.url.endsWith(".zip")) continue;
    if (!entry.sha512 || typeof entry.size !== "number") {
      throw new Error(
        `${options.metadata} ZIP file entries must include sha512 and size`,
      );
    }
    const stats = statSync(artifactPath);
    if (stats.size !== entry.size) {
      throw new Error(`${entry.url} size does not match ${options.metadata}`);
    }
    const digest = sha512Base64(artifactPath);
    if (digest !== entry.sha512) {
      throw new Error(`${entry.url} sha512 does not match ${options.metadata}`);
    }
  }

  const references = metadataReferences(metadata);
  for (const reference of references) validateReferenceName(reference);
  for (const arch of options.arches) {
    const base = `Space-Zero-${options.version}-${arch}`;
    if (!references.includes(`${base}.zip`)) {
      throw new Error(`${options.metadata} does not reference ${base}.zip`);
    }
  }
  for (const reference of references) ensureFile(join(options.dir, reference));

  for (const arch of options.arches) {
    const base = `Space-Zero-${options.version}-${arch}`;
    const dmg = join(options.dir, `${base}.dmg`);
    const zip = join(options.dir, `${base}.zip`);
    ensureFile(dmg);
    ensureFile(zip);
    ensureFile(join(options.dir, `${base}.zip.blockmap`));
    if (options.requireMacosTrust) {
      if (process.platform !== "darwin") {
        throw new Error("--require-macos-trust must run on macOS");
      }
      verifyDmgTrust(dmg);
      verifyZipTrust(zip);
    }
  }

  console.log("verified macOS release artifacts");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
