#!/usr/bin/env node
import { rm } from "node:fs/promises";

const generatedPaths = [
  "apps/desktop/dist",
  "apps/desktop/dist-builder",
  "apps/desktop/out",
  "apps/desktop/test-results",
  "apps/desktop/playwright-report",
  "apps/workspace-host/dist",
  "packages/host-contracts/dist",
  "packages/client-runtime/dist",
  "packages/pi-adapter/dist",
  "coverage",
  "playwright-report",
  "test-results",
  "reports",
];

await Promise.all(
  generatedPaths.map((path) => rm(path, { recursive: true, force: true })),
);
