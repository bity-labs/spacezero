import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";

const manifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

test("pi adapter is metadata/config only in initialization slice", () => {
  assert.deepEqual(manifest.exports, {});
  assert.equal(existsSync(new URL("../src", import.meta.url)), false);
  const deps = Object.keys(manifest.dependencies ?? {});
  assert.deepEqual(deps, ["effect"]);
});
