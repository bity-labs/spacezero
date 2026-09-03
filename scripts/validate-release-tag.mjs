#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";

const betaTagPattern =
  /^v((0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-beta\.(0|[1-9]\d*)(?:\.[0-9A-Za-z-]+)*)$/;

function fail(message) {
  console.error(`release tag validation failed: ${message}`);
  process.exitCode = 1;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const tag = process.argv[2] || process.env.GITHUB_REF_NAME || "";

if (!tag) {
  fail("release tag is required as an argument or GITHUB_REF_NAME");
} else {
  const match = betaTagPattern.exec(tag);
  if (!match) {
    fail(
      "release tag must be shaped like v<version>-beta.<number>, for example v0.1.0-beta.1",
    );
  } else {
    const version = match[1];
    const rootPackage = readJson(join(process.cwd(), "package.json"));
    const desktopPackage = readJson(
      join(process.cwd(), "apps/desktop/package.json"),
    );

    if (rootPackage.version !== desktopPackage.version) {
      fail(
        `root package version ${rootPackage.version} must match Desktop package version ${desktopPackage.version}`,
      );
    } else if (version !== rootPackage.version) {
      fail(
        `tag version ${version} does not match package version ${rootPackage.version}`,
      );
    } else {
      console.log(`validated beta release tag ${tag}`);
    }
  }
}
