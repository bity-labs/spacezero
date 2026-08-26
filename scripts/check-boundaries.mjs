#!/usr/bin/env node
import { builtinModules } from "node:module";
import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import {
  exactEffectVersion,
  inactivePaths,
  workspaces,
} from "./workspace-boundaries.mjs";

const root = process.cwd();
const errors = [];
const exactExternalVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const nodeBuiltinNames = new Set(
  builtinModules.map((name) => name.replace(/^node:/, "").split("/")[0]),
);

const browserSafeForbiddenDependencyNames = new Set([
  "electron",
  "react",
  "react-dom",
  "@spacezero/pi-adapter",
]);
const browserSafeForbiddenDependencyFragments = ["sqlite", "pi-sdk"];
const sourceExtensions = /\.(ts|tsx|mts|mjs|js)$/;
const configFilePattern =
  /(?:^|\/)(?:eslint\.config\.mjs|electron\.vite\.config\.ts|playwright\.config\.ts|vitest\.config\.ts|test-setup\.ts)$/;
const testFilePattern =
  /(?:^|\/)(?:test|tests)\/|\.(?:test|spec)\.(?:ts|tsx|mts|mjs|js)$/;

function json(path) {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}
function walk(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (
      ["node_modules", "dist", "out", "coverage", ".next", "storybook-static"].includes(
        entry,
      )
    )
      continue;
    const st = statSync(path);
    if (st.isDirectory()) walk(path, files);
    else if (sourceExtensions.test(entry)) files.push(path);
  }
  return files;
}
function isForbiddenBrowserSafeDependency(dep, meta, field) {
  if (
    meta.reactPeerOnly &&
    ["react", "react-dom"].includes(dep) &&
    ["peerDependencies", "devDependencies"].includes(field)
  ) {
    return false;
  }
  if (
    meta.reactPeerOnly &&
    dep.startsWith("@types/react") &&
    field === "devDependencies"
  ) {
    return false;
  }
  return (
    browserSafeForbiddenDependencyNames.has(dep) ||
    dep.startsWith("@types/react") ||
    browserSafeForbiddenDependencyFragments.some((fragment) =>
      dep.toLowerCase().includes(fragment),
    )
  );
}
function isNodeBuiltinSpecifier(spec) {
  const withoutScheme = spec.replace(/^node:/, "");
  return nodeBuiltinNames.has(withoutScheme.split("/")[0]);
}
function packageNameForSpecifier(spec) {
  if (spec === "mdx/types") return "@types/mdx";
  if (spec.startsWith("node:") || spec.startsWith(".") || spec.startsWith("#")) return undefined;
  if (isNodeBuiltinSpecifier(spec)) return undefined;
  const parts = spec.split("/");
  return spec.startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
}
function isTestOrConfigFile(rel) {
  return testFilePattern.test(rel) || configFilePattern.test(rel);
}
function dependencyNames(manifest) {
  return new Set(
    [
      "dependencies",
      "devDependencies",
      "peerDependencies",
      "optionalDependencies",
    ].flatMap((field) => Object.keys(manifest[field] ?? {})),
  );
}
function rootDevDependencyNames() {
  return new Set(Object.keys(json("package.json").devDependencies ?? {}));
}
const rootDevDependencies = rootDevDependencyNames();
function checkManifest(name, meta) {
  const manifestPath = `${meta.path}/package.json`;
  if (!existsSync(join(root, manifestPath)))
    errors.push(`${manifestPath}: missing workspace manifest`);
  const manifest = json(manifestPath);
  if (manifest.name !== name)
    errors.push(`${manifestPath}: expected name ${name}`);
  for (const field of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ]) {
    for (const [dep, spec] of Object.entries(manifest[field] ?? {})) {
      if (spec === "workspace:*") {
        if (!dep.startsWith("@spacezero/") || !meta.allowed.includes(dep)) {
          errors.push(
            `${manifestPath}: ${field}.${dep} workspace:* is only allowed for declared internal @spacezero dependencies`,
          );
        }
      } else if (!exactExternalVersion.test(spec)) {
        errors.push(
          `${manifestPath}: ${field}.${dep} must use exact version or workspace:* (got ${spec})`,
        );
      }
      if (
        (dep === "effect" || dep.startsWith("@effect/")) &&
        spec !== exactEffectVersion
      )
        errors.push(`${manifestPath}: ${dep} must be ${exactEffectVersion}`);
      if (dep.startsWith("@spacezero/") && !meta.allowed.includes(dep))
        errors.push(
          `${manifestPath}: undeclared/forbidden workspace dependency ${dep}`,
        );
      if (meta.browserSafe && isForbiddenBrowserSafeDependency(dep, meta, field))
        errors.push(
          `${manifestPath}: browser-safe dependency ${dep} is forbidden`,
        );
      if (
        name === "@spacezero/pi-adapter" &&
        dep !== "@earendil-works/pi-agent-core" &&
        dep !== "@earendil-works/pi-ai" &&
        dep !== "@earendil-works/pi-telemetry" &&
        /pi/i.test(dep)
      )
        errors.push(`${manifestPath}: Pi dependency ${dep} is deferred`);
    }
  }
  if (meta.kind === "package" && !manifest.exports)
    errors.push(`${manifestPath}: packages must declare exports policy`);
}
function sourceWorkspace(file) {
  const rel = relative(root, file);
  return Object.entries(workspaces).find(([, meta]) =>
    rel.startsWith(`${meta.path}/`),
  );
}
function workspaceForResolvedPath(path) {
  const real = realpathSync(path);
  return Object.entries(workspaces).find(([, meta]) => {
    const workspaceRoot = realpathSync(join(root, meta.path));
    return real === workspaceRoot || real.startsWith(`${workspaceRoot}/`);
  });
}
function desktopSurfaceForPath(path) {
  const rel = relative(root, path);
  for (const surface of ["main", "preload", "renderer"]) {
    if (rel.startsWith(`apps/desktop/src/${surface}/`)) return surface;
  }
  return undefined;
}
function resolvedRelativeImport(file, spec) {
  if (!spec.startsWith(".")) return undefined;
  const resolved = resolve(dirname(file), spec);
  const extensionFallbacks = spec.endsWith(".js")
    ? [
        resolve(dirname(file), spec.slice(0, -3) + ".ts"),
        resolve(dirname(file), spec.slice(0, -3) + ".tsx"),
      ]
    : [];
  const candidates = [
    resolved,
    ...extensionFallbacks,
    `${resolved}.ts`,
    `${resolved}.tsx`,
    `${resolved}.mjs`,
    `${resolved}.js`,
    join(resolved, "index.ts"),
  ];
  return candidates.find(
    (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
  );
}
function collectModuleSpecifiers(file, text) {
  const sourceFile = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const imports = [];
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier
    ) {
      if (ts.isStringLiteralLike(node.moduleSpecifier))
        imports.push({ spec: node.moduleSpecifier.text, kind: "static" });
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const [arg] = node.arguments;
        if (arg && ts.isStringLiteralLike(arg))
          imports.push({ spec: arg.text, kind: "dynamic" });
        else imports.push({ kind: "non-literal-dynamic" });
      } else if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === "require"
      ) {
        const [arg] = node.arguments;
        imports.push({
          spec: arg && ts.isStringLiteralLike(arg) ? arg.text : undefined,
          kind: "require",
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return imports;
}
function checkImports() {
  for (const file of walk(root)) {
    const rel = relative(root, file);
    const source = sourceWorkspace(file);
    if (!source) continue;
    const [name, meta] = source;
    const manifest = json(`${meta.path}/package.json`);
    const declaredDependencies = dependencyNames(manifest);
    const testOrConfig = isTestOrConfigFile(rel);
    if (meta.metadataOnly && rel.includes("/src/"))
      errors.push(
        `${rel}: metadata-only package must not contain implementation src`,
      );
    const text = readFileSync(file, "utf8");
    for (const found of collectModuleSpecifiers(file, text)) {
      if (found.kind === "non-literal-dynamic") {
        errors.push(`${rel}: non-literal dynamic import is forbidden`);
        continue;
      }
      if (found.kind === "require") {
        errors.push(
          `${rel}: require() is forbidden in strict ESM workspace source`,
        );
        if (!found.spec) continue;
      }
      const spec = found.spec;
      if (!spec) continue;
      const relativeTarget = resolvedRelativeImport(file, spec);
      if (relativeTarget) {
        const targetWorkspace = workspaceForResolvedPath(relativeTarget);
        if (!targetWorkspace) {
          errors.push(`${rel}: relative import escapes workspace (${spec})`);
        } else if (targetWorkspace[0] !== name) {
          errors.push(
            `${rel}: relative import crosses workspace boundary (${spec})`,
          );
        }
        const sourceSurface = desktopSurfaceForPath(file);
        const targetSurface = desktopSurfaceForPath(relativeTarget);
        if (sourceSurface && targetSurface !== sourceSurface) {
          errors.push(
            `${rel}: relative import leaves Desktop ${sourceSurface} process surface for ${targetSurface ?? "an unclassified Desktop path"} (${spec})`,
          );
        }
      }
      if (spec.startsWith(".") && !relativeTarget) continue;
      if (spec.includes("/src/"))
        errors.push(`${rel}: deep source import is forbidden (${spec})`);
      if (spec.startsWith("@spacezero/")) {
        const packageName = packageNameForSpecifier(spec) ?? spec;
        if (!meta.allowed.includes(packageName) && packageName !== name)
          errors.push(`${rel}: ${name} may not import ${packageName}`);
        if (
          packageName === "@spacezero/ui" &&
          name === "@spacezero/desktop" &&
          desktopSurfaceForPath(file) !== "renderer"
        )
          errors.push(
            `${rel}: Desktop may import @spacezero/ui only from renderer source`,
          );
      }
      const packageName = packageNameForSpecifier(spec);
      if (
        packageName &&
        packageName !== name &&
        !declaredDependencies.has(packageName) &&
        !(testOrConfig && rootDevDependencies.has(packageName))
      ) {
        errors.push(
          `${rel}: ${packageName} import must be declared by ${name} or be root dev tooling in a test/config file`,
        );
      }
      if (
        isNodeBuiltinSpecifier(spec) &&
        (meta.browserSafe || rel.startsWith("apps/desktop/src/renderer/"))
      )
        errors.push(`${rel}: browser-safe workspace cannot import ${spec}`);
      if (
        meta.browserSafe &&
        (spec === "electron" ||
          spec.includes("sqlite") ||
          spec.includes("pi-adapter"))
      )
        errors.push(`${rel}: browser-safe workspace cannot import ${spec}`);
      if (
        rel.startsWith("apps/desktop/src/renderer/") &&
        (spec === "electron" ||
          spec === "effect" ||
          spec.startsWith("@effect/"))
      )
        errors.push(`${rel}: renderer cannot import ${spec}`);
    }
  }
}
for (const p of inactivePaths)
  if (existsSync(join(root, p, "package.json")))
    errors.push(`${p}: inactive placeholder must not be a workspace`);
for (const [name, meta] of Object.entries(workspaces))
  checkManifest(name, meta);
checkImports();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("workspace boundaries ok");
