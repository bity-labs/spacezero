import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSkillDiscoveryService } from "./skill-discovery.service.js";

const skill = (name: string, description: string) =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\nDo the thing.\n`;

describe("skill discovery", () => {
  it("prefers project skills over Space Zero home and user skills", async () => {
    const root = await mkdtemp(join(tmpdir(), "spacezero-skills-"));
    const project = join(root, "project");
    const spaceZeroHome = join(root, "space-zero");
    const home = join(root, "home");
    await mkdir(join(project, ".agents", "skills", "shared"), {
      recursive: true,
    });
    await mkdir(join(spaceZeroHome, "skills", "shared"), { recursive: true });
    await mkdir(join(home, ".agents", "skills", "user-only"), {
      recursive: true,
    });
    await writeFile(
      join(project, ".agents", "skills", "shared", "SKILL.md"),
      skill("shared", "Project copy"),
    );
    await writeFile(
      join(spaceZeroHome, "skills", "shared", "SKILL.md"),
      skill("shared", "Home copy"),
    );
    await writeFile(
      join(home, ".agents", "skills", "user-only", "SKILL.md"),
      skill("user-only", "User copy"),
    );

    const service = createSkillDiscoveryService({
      spaceZeroHome,
      homePath: home,
    });
    const result = await service.listSkills({
      sessionId: "session-1",
      projectRoot: project,
      projectTrusted: true,
    });

    expect(result.skills.map((entry) => entry.name)).toEqual([
      "shared",
      "user-only",
    ]);
    expect(result.skills[0]).toMatchObject({
      name: "shared",
      description: "Project copy",
      scope: "project_agents",
    });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "skill_collision", name: "shared" }),
    );
  });

  it("excludes project-local skills until the project is trusted", async () => {
    const root = await mkdtemp(join(tmpdir(), "spacezero-skills-"));
    const project = join(root, "project");
    const spaceZeroHome = join(root, "space-zero");
    const home = join(root, "home");
    await mkdir(join(project, ".agents", "skills", "project-only"), {
      recursive: true,
    });
    await writeFile(
      join(project, ".agents", "skills", "project-only", "SKILL.md"),
      skill("project-only", "Project copy"),
    );

    const service = createSkillDiscoveryService({
      spaceZeroHome,
      homePath: home,
    });
    const result = await service.listSkills({
      sessionId: "session-1",
      projectRoot: project,
      projectTrusted: false,
    });

    expect(result.skills).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "project_trust_required" }),
    );
  });

  it("scans only approved global roots when no projectRoot is supplied", async () => {
    const root = await mkdtemp(join(tmpdir(), "spacezero-skills-"));
    const spaceZeroHome = join(root, "space-zero");
    const home = join(root, "home");
    await mkdir(join(spaceZeroHome, "skills", "home-global"), {
      recursive: true,
    });
    await mkdir(join(home, ".agents", "skills", "user-global"), {
      recursive: true,
    });
    // Project-local style roots colocated under Space Zero Home and the home
    // directory must never be scanned for global-only discovery.
    const decoys: readonly { readonly path: string; readonly name: string }[] = [
      {
        path: join(spaceZeroHome, ".agents", "skills", "home-agents-decoy"),
        name: "home-agents-decoy",
      },
      {
        path: join(spaceZeroHome, ".pi", "skills", "home-pi-decoy"),
        name: "home-pi-decoy",
      },
      {
        path: join(home, ".pi", "skills", "home-user-pi-decoy"),
        name: "home-user-pi-decoy",
      },
    ];
    for (const decoy of decoys) {
      await mkdir(decoy.path, { recursive: true });
      await writeFile(
        join(decoy.path, "SKILL.md"),
        skill(decoy.name, "Decoy copy"),
      );
    }
    await writeFile(
      join(spaceZeroHome, "skills", "home-global", "SKILL.md"),
      skill("home-global", "Space Zero Home copy"),
    );
    await writeFile(
      join(home, ".agents", "skills", "user-global", "SKILL.md"),
      skill("user-global", "User copy"),
    );

    const service = createSkillDiscoveryService({
      spaceZeroHome,
      homePath: home,
    });
    const result = await service.listSkills({ sessionId: "global-1" });

    expect(result.skills.map((entry) => entry.name)).toEqual([
      "home-global",
      "user-global",
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  it("excludes disabled global skills from Space Zero Home and user scopes", async () => {
    const root = await mkdtemp(join(tmpdir(), "spacezero-skills-"));
    const spaceZeroHome = join(root, "space-zero");
    const home = join(root, "home");
    await mkdir(join(spaceZeroHome, "skills", "disabled-home"), {
      recursive: true,
    });
    await mkdir(join(home, ".agents", "skills", "disabled-user"), {
      recursive: true,
    });
    await mkdir(join(home, ".agents", "skills", "enabled-user"), {
      recursive: true,
    });
    await writeFile(
      join(spaceZeroHome, "skills", "disabled-home", "SKILL.md"),
      skill("disabled-home", "Disabled Space Zero Home copy"),
    );
    await writeFile(
      join(home, ".agents", "skills", "disabled-user", "SKILL.md"),
      skill("disabled-user", "Disabled user copy"),
    );
    await writeFile(
      join(home, ".agents", "skills", "enabled-user", "SKILL.md"),
      skill("enabled-user", "Enabled user copy"),
    );

    const service = createSkillDiscoveryService({
      spaceZeroHome,
      homePath: home,
    });
    const result = await service.listSkills({
      sessionId: "global-1",
      disabledGlobalSkillNames: new Set(["disabled-home", "disabled-user"]),
    });

    expect(result.skills.map((entry) => entry.name)).toEqual(["enabled-user"]);
    expect(result.internalSkills.map((entry) => entry.name)).toEqual([
      "enabled-user",
    ]);
  });

  it("does not apply global disable preferences to project-scoped skills", async () => {
    const root = await mkdtemp(join(tmpdir(), "spacezero-skills-"));
    const project = join(root, "project");
    const spaceZeroHome = join(root, "space-zero");
    const home = join(root, "home");
    await mkdir(join(project, ".agents", "skills", "shared"), {
      recursive: true,
    });
    await mkdir(join(spaceZeroHome, "skills", "shared"), { recursive: true });
    await writeFile(
      join(project, ".agents", "skills", "shared", "SKILL.md"),
      skill("shared", "Project copy"),
    );
    await writeFile(
      join(spaceZeroHome, "skills", "shared", "SKILL.md"),
      skill("shared", "Home copy"),
    );

    const service = createSkillDiscoveryService({
      spaceZeroHome,
      homePath: home,
    });
    const result = await service.listSkills({
      sessionId: "session-1",
      projectRoot: project,
      projectTrusted: true,
      disabledGlobalSkillNames: new Set(["shared"]),
    });

    expect(result.skills).toEqual([
      expect.objectContaining({
        name: "shared",
        description: "Project copy",
        scope: "project_agents",
      }),
    ]);
  });
});
