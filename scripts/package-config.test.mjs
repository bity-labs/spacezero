import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readText(path) {
  return readFileSync(join(root, path), "utf8");
}

test("checked-in GitHub App example contains only public packaged fields", () => {
  const example = JSON.parse(readText("resources/github-app.example.json"));
  assert.deepEqual(Object.keys(example).sort(), ["appSlug", "clientId"]);
  assert.match(example.clientId, /^Iv1\./);
  assert.match(example.appSlug, /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);
  assert.equal("clientSecret" in example, false);
  assert.equal("privateKey" in example, false);
});

test("Electron Builder config declares macOS beta updater artifacts", () => {
  const config = readText("apps/desktop/electron-builder.yml");
  assert.match(
    config,
    /artifactName:\s*\$\{productName\}-\$\{version\}-\$\{arch\}\.\$\{ext\}/,
  );
  assert.match(config, /generateUpdatesFilesForAllChannels:\s*true/);
  assert.match(config, /mac:\n(?:.|\n)*target:\n(?:.|\n)*target:\s*dmg/);
  assert.match(config, /mac:\n(?:.|\n)*target:\n(?:.|\n)*target:\s*zip/);
  assert.match(config, /category:\s*public\.app-category\.developer-tools/);
  assert.match(config, /hardenedRuntime:\s*true/);
  assert.match(config, /notarize:\s*true/);
  assert.match(
    config,
    /publish:\n(?:.|\n)*provider:\s*github\n(?:.|\n)*owner:\s*bity-labs\n(?:.|\n)*repo:\s*spacezero\n(?:.|\n)*channel:\s*beta/,
  );
});

test("Electron Builder config packages only public GitHub App config and no secret values", () => {
  const config = readText("apps/desktop/electron-builder.yml");
  assert.match(
    config,
    /extraResources:\n\s*- from:\s*\.\.\/\.\.\/resources\/github-app\.json\n\s*to:\s*github-app\.json/,
  );
  assert.doesNotMatch(
    config,
    /APPLE_API_KEY_P8|CSC_KEY_PASSWORD|APPLE_APP_SPECIFIC_PASSWORD|GITHUB_APP_PRIVATE_KEY|clientSecret|privateKey/,
  );
});
