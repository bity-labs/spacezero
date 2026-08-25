#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const allowedTopLevelGroups = new Set(["Design System", "Features", "Screens"]);
const storyFilePattern = /\.stories\.(js|jsx|mjs|ts|tsx)$/;
const ignoredDirs = new Set([
  ".git",
  ".next",
  ".pi-subagents",
  ".worktrees",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "storybook-static",
]);
const errors = [];

function walk(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    if (ignoredDirs.has(entry)) continue;
    const path = join(dir, entry);
    const st = statSync(path);
    if (st.isDirectory()) walk(path, files);
    else if (storyFilePattern.test(entry)) files.push(path);
  }
  return files;
}

function storyTitle(text) {
  const titleMatch = text.match(/\btitle\s*:\s*(["'`])([^"'`]+)\1/);
  return titleMatch?.[2];
}

function checkRuntimeAccess(rel, text) {
  if (/\bwindow\.spacezero\b/.test(text)) {
    errors.push(`${rel}: stories must not access window.spacezero`);
  }
  if (/\bwindow\s*\[\s*(["'`])spacezero\1\s*\]/.test(text)) {
    errors.push(`${rel}: stories must not access window["spacezero"]`);
  }
  if (/\{[^}]*\bspacezero\b[^}]*\}\s*=\s*window\b/.test(text)) {
    errors.push(`${rel}: stories must not destructure spacezero from window`);
  }
}

const storyFiles = walk(root);

if (storyFiles.length === 0) {
  errors.push("No Storybook stories found");
}

for (const file of storyFiles) {
  const rel = relative(root, file);
  const text = readFileSync(file, "utf8");
  const title = storyTitle(text);

  checkRuntimeAccess(rel, text);

  if (!title) {
    errors.push(`${rel}: story file must declare a static title`);
    continue;
  }
  if (title === "Smoke" || title.startsWith("Smoke/")) {
    errors.push(`${rel}: Smoke/* stories are not allowed`);
  }
  const [topLevelGroup] = title.split("/");
  if (!allowedTopLevelGroups.has(topLevelGroup)) {
    errors.push(
      `${rel}: story title must start with Design System, Features, or Screens`,
    );
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`storybook guardrails ok (${storyFiles.length} stories)`);
