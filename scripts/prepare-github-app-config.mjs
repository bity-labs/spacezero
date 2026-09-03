#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const clientId = process.env.SPACEZERO_GITHUB_CLIENT_ID ?? "";
const appSlug = process.env.SPACEZERO_GITHUB_APP_SLUG ?? "";
const errors = [];

if (!clientId) {
  errors.push("SPACEZERO_GITHUB_CLIENT_ID is required");
} else if (!/^[A-Za-z0-9_.-]+$/.test(clientId)) {
  errors.push(
    "SPACEZERO_GITHUB_CLIENT_ID must be a non-empty public identifier without whitespace",
  );
}

if (!appSlug) {
  errors.push("SPACEZERO_GITHUB_APP_SLUG is required");
} else if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(appSlug)) {
  errors.push("SPACEZERO_GITHUB_APP_SLUG must be a lowercase GitHub App slug");
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

const resourcesDir = join(process.cwd(), "resources");
mkdirSync(resourcesDir, { recursive: true });
writeFileSync(
  join(resourcesDir, "github-app.json"),
  `${JSON.stringify({ clientId, appSlug }, null, 2)}\n`,
  { mode: 0o600 },
);
console.log("Wrote packaged public GitHub App config.");
