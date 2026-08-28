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
});
