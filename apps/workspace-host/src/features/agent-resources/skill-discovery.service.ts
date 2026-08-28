import { createHash } from "node:crypto";
import { readdir, readFile, realpath, lstat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve, relative } from "node:path";
import type {
  AgentResourceDiagnostic,
  AgentResourceScope,
  AgentSkillDescriptor,
  ListProjectSessionSkillsResult,
} from "@spacezero/host-contracts";

export interface InternalAgentSkillResource extends AgentSkillDescriptor {
  readonly body: string;
}

export interface SkillDiscoveryResult extends ListProjectSessionSkillsResult {
  readonly internalSkills: readonly InternalAgentSkillResource[];
}

export interface SkillDiscoveryOptions {
  readonly spaceZeroHome: string;
  readonly homePath?: string;
  readonly maxSkillBytes?: number;
  readonly maxSkillsPerRoot?: number;
}

interface SkillRoot {
  readonly path: string;
  readonly scope: AgentResourceScope;
  readonly trusted: boolean;
}

const defaultMaxSkillBytes = 128_000;
const defaultMaxSkillsPerRoot = 200;
const maxAggregateSkillBytes = 1_000_000;

const isWithin = (child: string, parent: string): boolean => {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/"));
};

const frontmatter = (body: string): { name: string; description: string } => {
  const match = /^---\n([\s\S]*?)\n---/.exec(body);
  if (!match) throw new Error("missing frontmatter");
  const lines = match[1]!.split("\n");
  const values = new Map<string, string>();
  for (const line of lines) {
    const index = line.indexOf(":");
    if (index === -1) continue;
    values.set(line.slice(0, index).trim(), line.slice(index + 1).trim());
  }
  const name = values.get("name");
  if (!name || !/^[a-z0-9][a-z0-9-]{0,127}$/.test(name))
    throw new Error("invalid name");
  const description = values.get("description") ?? "";
  if (description.length > 1_000) throw new Error("description too long");
  return { name, description };
};

const diagnostic = (input: {
  readonly code: AgentResourceDiagnostic["code"];
  readonly scope: AgentResourceScope;
  readonly name?: string;
  readonly message: string;
}): AgentResourceDiagnostic => ({
  code: input.code,
  scope: input.scope,
  ...(input.name === undefined ? {} : { name: input.name }),
  message: input.message,
});

export const createSkillDiscoveryService = (options: SkillDiscoveryOptions) => {
  const maxSkillBytes = options.maxSkillBytes ?? defaultMaxSkillBytes;
  const maxSkillsPerRoot = options.maxSkillsPerRoot ?? defaultMaxSkillsPerRoot;
  const homePath = resolve(options.homePath ?? homedir());
  const spaceZeroHome = resolve(options.spaceZeroHome);

  const rootsFor = (input: {
    readonly projectRoot: string;
    readonly projectTrusted: boolean;
  }): readonly SkillRoot[] => {
    const roots: SkillRoot[] = [];
    if (input.projectTrusted) {
      let current = resolve(input.projectRoot);
      while (
        current !== homePath &&
        current !== spaceZeroHome &&
        current !== dirname(current)
      ) {
        roots.push({
          path: join(current, ".agents", "skills"),
          scope: "project_agents",
          trusted: true,
        });
        roots.push({
          path: join(current, ".pi", "skills"),
          scope: "project_pi",
          trusted: true,
        });
        current = dirname(current);
      }
    }
    roots.push({
      path: join(spaceZeroHome, "skills"),
      scope: "spacezero_home",
      trusted: true,
    });
    roots.push({
      path: join(homePath, ".agents", "skills"),
      scope: "user_agents",
      trusted: true,
    });
    return roots;
  };

  const listSkills = async (input: {
    readonly sessionId: string;
    readonly projectRoot: string;
    readonly projectTrusted: boolean;
  }): Promise<SkillDiscoveryResult> => {
    const diagnostics: AgentResourceDiagnostic[] = [];
    if (!input.projectTrusted) {
      diagnostics.push(
        diagnostic({
          code: "project_trust_required",
          scope: "project_agents",
          message:
            "Project-local skills are excluded until the Project is trusted.",
        }),
      );
    }
    const byName = new Map<string, InternalAgentSkillResource>();
    let aggregateBytes = 0;
    for (const root of rootsFor(input)) {
      let rootReal: string;
      try {
        rootReal = await realpath(root.path);
      } catch {
        continue;
      }
      let entries = await readdir(rootReal, { withFileTypes: true }).catch(
        () => [],
      );
      entries = entries.slice(0, maxSkillsPerRoot);
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillPath = join(rootReal, entry.name, "SKILL.md");
        try {
          const stat = await lstat(skillPath);
          if (!stat.isFile() || stat.isSymbolicLink())
            throw new Error("not file");
          const realSkillPath = await realpath(skillPath);
          if (!isWithin(realSkillPath, rootReal)) {
            diagnostics.push(
              diagnostic({
                code: "skill_symlink_escape",
                scope: root.scope,
                message: "A skill path escaped its configured root.",
              }),
            );
            continue;
          }
          if (stat.size > maxSkillBytes) {
            diagnostics.push(
              diagnostic({
                code: "skill_too_large",
                scope: root.scope,
                name: entry.name,
                message: "A skill exceeded the configured size limit.",
              }),
            );
            continue;
          }
          const body = await readFile(skillPath, "utf8");
          if (Buffer.byteLength(body, "utf8") > maxSkillBytes) {
            diagnostics.push(
              diagnostic({
                code: "skill_too_large",
                scope: root.scope,
                name: entry.name,
                message: "A skill exceeded the configured size limit.",
              }),
            );
            continue;
          }
          if (
            aggregateBytes + Buffer.byteLength(body, "utf8") >
            maxAggregateSkillBytes
          ) {
            diagnostics.push(
              diagnostic({
                code: "skill_too_large",
                scope: root.scope,
                name: entry.name,
                message: "The aggregate skill resource budget was exceeded.",
              }),
            );
            continue;
          }
          const meta = frontmatter(body);
          if (byName.has(meta.name)) {
            diagnostics.push(
              diagnostic({
                code: "skill_collision",
                scope: root.scope,
                name: meta.name,
                message:
                  "A lower-precedence skill was ignored because another skill has the same name.",
              }),
            );
            continue;
          }
          aggregateBytes += Buffer.byteLength(body, "utf8");
          byName.set(meta.name, {
            name: meta.name,
            description: meta.description,
            scope: root.scope,
            digest: createHash("sha256").update(body).digest("hex"),
            enabled: true,
            trusted: root.trusted,
            body,
          });
        } catch {
          diagnostics.push(
            diagnostic({
              code: "skill_malformed",
              scope: root.scope,
              name: entry.name,
              message: "A skill could not be parsed.",
            }),
          );
        }
      }
    }
    const internalSkills = [...byName.values()];
    return {
      sessionId: input.sessionId,
      skills: internalSkills.map((skill) => ({
        name: skill.name,
        description: skill.description,
        scope: skill.scope,
        digest: skill.digest,
        enabled: skill.enabled,
        trusted: skill.trusted,
      })),
      diagnostics,
      internalSkills,
    };
  };

  return { listSkills };
};
