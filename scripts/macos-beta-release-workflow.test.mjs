import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const workflow = readFileSync(
  join(process.cwd(), ".github/workflows/macos-beta-release.yml"),
  "utf8",
);

function indexOfRequired(fragment) {
  const index = workflow.indexOf(fragment);
  assert.notEqual(index, -1, `missing workflow fragment: ${fragment}`);
  return index;
}

test("runs only for beta version tags with read-only default permissions", () => {
  assert.match(workflow, /tags:\n\s+- "v\*-beta\.\*"/);
  assert.match(workflow, /permissions:\n\s+contents:\s+read/);
  assert.match(workflow, /concurrency:/);
  assert.match(workflow, /runner:\s+macos-15-intel/);
  assert.doesNotMatch(workflow, /macos-13/);
});

test("uses pinned GitHub Action commits instead of mutable tags", () => {
  assert.doesNotMatch(workflow, /uses:\s+[^\s#]+@v\d/);
  const pinnedUses = [...workflow.matchAll(/uses:\s+[^\s#]+@[0-9a-f]{40}/g)];
  assert.ok(
    pinnedUses.length >= 5,
    "expected workflow actions to be pinned to commit SHAs",
  );
  const checkoutCredentialsDisabled = [
    ...workflow.matchAll(/persist-credentials:\s+false/g),
  ];
  assert.equal(checkoutCredentialsDisabled.length, 3);
});

test("validates, tests, and builds before signing credentials are exposed", () => {
  const validate = indexOfRequired("pnpm release:validate-tag");
  const tests = indexOfRequired("pnpm test");
  const build = indexOfRequired("pnpm build");
  const packageJob = indexOfRequired("package-macos:");
  const packageInputBuild = indexOfRequired(
    "Build package inputs without release credentials",
  );
  const appleSecret = indexOfRequired(
    "APPLE_API_KEY_P8: ${{ secrets.APPLE_API_KEY_P8 }}",
  );
  assert.ok(validate < packageJob);
  assert.ok(tests < packageJob);
  assert.ok(build < packageJob);
  assert.ok(packageJob < packageInputBuild);
  assert.ok(packageInputBuild < appleSecret);
});

test("embeds the configured R2 update base URL before packaging", () => {
  assert.match(
    workflow,
    /SPACEZERO_MACOS_UPDATE_BASE_URL: \$\{\{ vars\.SPACEZERO_MACOS_UPDATE_BASE_URL \}\}/,
  );
  assert.match(
    workflow,
    /SPACEZERO_GITHUB_APP_SLUG SPACEZERO_MACOS_UPDATE_BASE_URL/,
  );
});

test("uses App Store Connect API-key notarization and cleans up the temporary key", () => {
  assert.match(
    workflow,
    /APPLE_API_KEY_P8: \$\{\{ secrets\.APPLE_API_KEY_P8 \}\}/,
  );
  assert.match(
    workflow,
    /APPLE_API_KEY_ID: \$\{\{ secrets\.APPLE_API_KEY_ID \}\}/,
  );
  assert.match(workflow, /APPLE_ISSUER: \$\{\{ secrets\.APPLE_ISSUER \}\}/);
  assert.match(workflow, /export APPLE_API_KEY="\$api_key_path"/);
  assert.match(workflow, /export APPLE_API_ISSUER="\$APPLE_ISSUER"/);
  assert.match(workflow, /trap cleanup EXIT/);
  assert.match(workflow, /pnpm release:notarize-macos-dmg/);
  assert.doesNotMatch(workflow, /APPLE_APP_SPECIFIC_PASSWORD|APPLE_ID:/);
});

test("publishes to R2 only after verified artifacts are downloaded and rechecked", () => {
  const publish = indexOfRequired("publish-r2-release:");
  const publishGate = indexOfRequired(
    "SPACEZERO_MACOS_RELEASE_PUBLISH_ENABLED == 'true'",
  );
  const readPermission = workflow.lastIndexOf("contents: read");
  const merge = indexOfRequired("pnpm release:merge-macos-update-metadata");
  const verify = workflow.lastIndexOf("pnpm release:verify-macos-artifacts");
  const upload = indexOfRequired("pnpm release:upload-r2-artifacts");
  assert.ok(publish < publishGate);
  assert.ok(publish < readPermission);
  assert.ok(publish < merge);
  assert.ok(merge < verify);
  assert.ok(verify < upload);
  assert.match(workflow, /CLOUDFLARE_R2_ACCESS_KEY_ID/);
  assert.match(workflow, /CLOUDFLARE_R2_SECRET_ACCESS_KEY/);
  assert.match(workflow, /SPACEZERO_R2_BUCKET/);
  assert.match(workflow, /CLOUDFLARE_ACCOUNT_ID/);
  assert.doesNotMatch(workflow, /contents:\s+write/);
  assert.doesNotMatch(workflow, /gh release create|gh release upload|GH_TOKEN/);
});
