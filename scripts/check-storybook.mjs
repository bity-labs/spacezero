#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const workspaceArg = process.argv[2] ?? ".";
const workspacePath = resolve(root, workspaceArg);
const sourcePath = join(workspacePath, "src");
const allowedTopLevelGroups = new Set(["Design System", "Features", "Screens"]);
const storyFilePattern = /\.stories\.(?:js|jsx|mdx|mjs|ts|tsx)$/;
const errors = [];

function walk(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (["node_modules", "dist", "out", "coverage"].includes(entry)) continue;
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, files);
    else if (storyFilePattern.test(entry)) files.push(path);
  }
  return files;
}

function staticTitle(text) {
  return /title\s*:\s*["'`]([^"'`]+)["'`]/.exec(text)?.[1];
}

const storyFiles = walk(sourcePath);

if (storyFiles.length === 0) {
  errors.push(`${relative(root, sourcePath)}: no Storybook stories found`);
}

for (const file of storyFiles) {
  const rel = relative(root, file);
  const text = readFileSync(file, "utf8");

  if (
    /window\s*\.\s*spacezero/.test(text) ||
    /window\s*\[\s*["'`]spacezero["'`]\s*\]/.test(text) ||
    /\{[^}]*\bspacezero\b[^}]*\}\s*=\s*window\b/.test(text)
  ) {
    errors.push(`${rel}: stories must not reference window.spacezero`);
  }

  const title = staticTitle(text);
  if (!title) {
    errors.push(`${rel}: story must declare a static title`);
    continue;
  }

  if (title.startsWith("Smoke/")) {
    errors.push(`${rel}: story title must not use Smoke/*`);
  }

  const [topLevel] = title.split("/");
  if (!allowedTopLevelGroups.has(topLevel ?? "")) {
    errors.push(
      `${rel}: story title must start with Design System, Features, or Screens`,
    );
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("storybook stories ok");
