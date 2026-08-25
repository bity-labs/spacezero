import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const checkerPath = join(process.cwd(), "scripts/check-storybook.mjs");

function makeWorkspace(files) {
  const dir = mkdtempSync(join(tmpdir(), "spacezero-storybook-"));
  const sourceDir = join(dir, "src");
  mkdirSync(sourceDir, { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(sourceDir, path);
    mkdirSync(join(fullPath, ".."), { recursive: true });
    writeFileSync(fullPath, content);
  }
  return dir;
}

function run(dir) {
  return spawnSync(process.execPath, [checkerPath, dir], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

const validStory = (title) => `
const meta = {
  title: "${title}",
};
export default meta;
`;

test("accepts documented story title groups", () => {
  const result = run(
    makeWorkspace({
      "button.stories.tsx": validStory("Design System/Primitives/Button"),
      "row.stories.tsx": validStory("Features/Projects/Components/Row"),
      "global-chat.stories.tsx": validStory("Screens/Global Chat"),
    }),
  );
  assert.equal(result.status, 0, result.stderr);
});

test("rejects an empty story workspace", () => {
  const result = run(makeWorkspace({}));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /no Storybook stories found/);
});

test("rejects missing static story title", () => {
  const result = run(makeWorkspace({ "x.stories.tsx": "export default {};" }));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /static title/);
});

test("rejects Smoke story titles", () => {
  const result = run(
    makeWorkspace({ "x.stories.tsx": validStory("Smoke/Button") }),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Smoke/);
});

test("rejects unknown top-level story groups", () => {
  const result = run(
    makeWorkspace({ "x.stories.tsx": validStory("Widgets/Button") }),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Design System, Features, or Screens/);
});

test("rejects direct preload bridge references", () => {
  const result = run(
    makeWorkspace({
      "x.stories.tsx": `${validStory("Design System/Primitives/Button")}const { spacezero } = window; window["spacezero"];`,
    }),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /window\.spacezero/);
});
