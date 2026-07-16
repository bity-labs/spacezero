---
title: Use Agent Skills from Space Zero and Standard Project Scopes
---

## Status

Accepted

## Context

Space Zero uses Pi as its agent harness, and its agent sessions need reusable workflows without forcing users to duplicate skills for each client. The Agent Skills specification defines the `SKILL.md` format but intentionally does not mandate one filesystem location. The interoperable convention is `.agents/skills/`, while Space Zero also has a configurable user-owned Space Zero Home.

Pi supports skill discovery and native `/skill:name` expansion through `DefaultResourceLoader`, but Space Zero currently composes Pi resources programmatically and disables default skill discovery. The renderer also needs to make available skills discoverable in the chat composer.

## Decision

Space Zero supports both a native Space Zero skill location and the standard Agent Skills locations:

```text
<Space Zero Home>/skills/                 # Space Zero-managed global skills
~/.agents/skills/                          # shared user-level compatibility skills
<project>/.agents/skills/                 # project-level standard skills
<project>/.pi/skills/                     # project-level Pi skills
```

Space Zero does not copy or move skills between locations.

Space Zero composes these paths explicitly for each agent session and passes them to Pi's `DefaultResourceLoader` as additional skill paths. Pi's default broad resource discovery remains disabled so Space Zero controls the capability surface.

Skill precedence is:

1. Project skills, with the closest project ancestor first.
2. Space Zero Home skills.
3. `~/.agents/skills` skills.
4. Future built-in or package skills.

When skill names collide, the higher-precedence skill wins and Space Zero retains a diagnostic for the collision.

Project-local skills are loaded only for Project Sessions. Workspace Sessions receive Space Zero Home and user-level skills, not skills found in the workspace-session cwd or its application-data ancestors.

Pi's native `/skill:name` command is the activation mechanism. Space Zero's chat input provides `/` and `/skill:` discovery, filtering, keyboard navigation, and insertion, then passes the selected command unchanged to Pi for expansion.

Skill metadata is exposed to the renderer per session. Only name, description, and scope are exposed; filesystem paths remain in the utility process.

## Rationale

The native Space Zero directory makes Space Zero-managed skills portable with the user's workspace configuration and manageable by future Space Zero UI. `.agents/skills` preserves interoperability with other Agent Skills clients and existing user/project skill libraries. Project-local skills remain versionable with the repository and can encode repository-specific workflows.

Using Pi's native command preserves its progressive-disclosure behavior: skill metadata is available at session start, while the full `SKILL.md` is injected only when the skill is explicitly activated. Reimplementing skill parsing or expansion in the renderer would duplicate Pi behavior and weaken the process boundary.

Explicit path composition keeps Space Zero's security model and allows project trust, precedence, collision diagnostics, and session-specific scopes to remain application policy rather than accidental Pi defaults.

## Consequences

- The main process resolves skill directories using the configured Space Zero Home and project cwd before creating a session.
- The utility owns Pi skill loading and expansion; the renderer receives only safe skill descriptors.
- Chat composer UI must handle empty skill catalogs, malformed skill diagnostics, and skill name collisions without blocking normal prompts.
- Project trust must be added or integrated before untrusted repository skills are enabled broadly.
- Skill changes are picked up when a new session is created or a session is explicitly reloaded; live sessions do not silently change their skill catalog.
- Skills are not stored in the Knowledge Base. The Knowledge Base remains for durable user knowledge and documentation.

## Alternatives Considered

- **Only `<Space Zero Home>/skills`** — rejected because it prevents interoperability with the established `.agents/skills` convention.
- **Only Pi's default global and project discovery** — rejected because it would hide Space Zero's storage policy and re-enable broad resource discovery that the Pi integration ADR intentionally disabled.
- **Copy all skills into one directory** — rejected because it creates synchronization problems and changes the source-of-truth semantics of project and shared skills.
- **Implement `/skill` expansion in the renderer** — rejected because Pi already owns native expansion and filesystem access belongs outside the renderer.

## Review Trigger

Revisit this decision if the Agent Skills specification changes its location conventions, if Space Zero adds remote skill registries, or if project trust requires a stronger sandbox than Pi's resource loader provides.
