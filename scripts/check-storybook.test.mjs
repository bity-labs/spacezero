import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, cpSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const checkerPath = join(process.cwd(), "scripts/check-storybook.mjs");

function makeRepo(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), "spacezero-storybook-"));
  mkdirSync(join(dir, "scripts"), { recursive: true });
  cpSync(
    "scripts/check-storybook.mjs",
    join(dir, "scripts/check-storybook.mjs"),
  );
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

function run(dir) {
  return spawnSync(process.execPath, [checkerPath], {
    cwd: dir,
    encoding: "utf8",
  });
}

const validStory = `
const meta = { title: "Design System/Primitives/Button" };
export default meta;
export const Primary = {};
`;

test("accepts valid Storybook titles", () => {
  const result = run(makeRepo({ "src/button.stories.tsx": validStory }));
  assert.equal(result.status, 0, result.stderr);
});

test("rejects repositories with no stories", () => {
  const result = run(makeRepo());
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /No Storybook stories found/);
});

test("rejects Smoke stories", () => {
  const result = run(
    makeRepo({
      "src/smoke.stories.tsx": `const meta = { title: "Smoke/Button" }; export default meta;`,
    }),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Smoke/);
});

test("rejects unknown top-level title groups", () => {
  const result = run(
    makeRepo({
      "src/other.stories.tsx": `const meta = { title: "Other/Button" }; export default meta;`,
    }),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Design System, Features, or Screens/);
});

test("rejects direct window.spacezero access", () => {
  const result = run(
    makeRepo({
      "src/runtime.stories.tsx": `${validStory}\nwindow.spacezero;`,
    }),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /window\.spacezero/);
});

test("rejects bracket window spacezero access", () => {
  const result = run(
    makeRepo({
      "src/runtime.stories.tsx": `${validStory}\nwindow["spacezero"];`,
    }),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /window\["spacezero"\]/);
});

test("rejects destructured window spacezero access", () => {
  const result = run(
    makeRepo({
      "src/runtime.stories.tsx": `${validStory}\nconst { spacezero } = window;`,
    }),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /destructure/);
});

test("scans all story extensions accepted by Storybook", () => {
  const files = Object.fromEntries(
    ["js", "jsx", "mjs", "ts", "tsx"].map((extension) => [
      `src/${extension}.stories.${extension}`,
      validStory,
    ]),
  );
  const result = run(makeRepo(files));
  assert.equal(result.status, 0, result.stderr);
});
