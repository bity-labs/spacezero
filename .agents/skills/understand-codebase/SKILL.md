---
name: understand-codebase
description: Build a useful map of an unfamiliar codebase area. Use when the user wants to understand how code works, where behavior lives, what calls what, or how a feature/module fits into the bigger picture.
---

# Understand Codebase

Map an unfamiliar area of code so the user can reason about it safely before changing, debugging, reviewing, or planning work.

This skill explains the current shape of the code. It does not refactor, diagnose, review, or propose architecture work unless the user explicitly asks for that next step.

## Read These First

1. `docs/context.md` — domain language and project model
2. Relevant `docs/adr/` files — decisions that explain why the code is shaped this way
3. `docs/coding-standards.md` — project conventions
4. Relevant files under `docs/engineering/` only if the question touches a specific risk area:
   - `architecture-boundaries.md` for layers, adapters, or dependency direction
   - `domain-modeling.md` for business terms, states, or rules
   - `data-modeling.md` for schemas, persistence, or ownership
   - `legacy-code.md` for risky or poorly understood code

If a doc is missing, say so and continue from code evidence.

## Workflow

### 1. Clarify the Area

Identify what the user wants to understand.

Examples:

- a feature
- a module or package
- a function or class
- a failing behavior's surrounding code
- a PR's touched area
- an integration with an external system

If the request is broad, pick the smallest useful entry point and say what you are using as the starting point.

### 2. Load Project Language

Read the project context and relevant ADRs before naming concepts.

Look for:

- domain terms the code should use
- important states and invariants
- external systems and integration boundaries
- decisions that explain current tradeoffs
- words that are overloaded or inconsistent between docs and code

Use the project's language. Do not invent new names when the project already has them.

### 3. Find Entry Points

Start from the user's file, route, command, test, issue, or feature name.

Then trace outward:

- callers
- callees
- imports and exports
- public APIs or route handlers
- persistence/schema touchpoints
- external service boundaries
- tests that describe expected behavior

Prefer code search and targeted reads over opening many unrelated files.

### 4. Build the Map

Explain the area at the right level of abstraction.

Include:

- what this area is responsible for
- which files/modules matter and why
- how control flows through the system
- how data flows or changes shape
- which domain terms map to which code concepts
- what boundaries or seams exist
- what behavior is covered by tests
- what is still unknown or ambiguous

Distinguish facts from guesses. If something is inferred, label it as an inference.

### 5. Avoid Scope Drift

Do not turn this into a different workflow by default.

- Do not fix bugs; recommend `debug` if a root-cause investigation is needed.
- Do not review a PR; recommend `code-review` if review is needed.
- Do not refactor; recommend `refactor-safely` if the user wants changes.
- Do not create architecture issues; recommend `inspect-architecture` if broad architecture friction is found.
- Do not write a PRD; recommend `write-prd` if the user wants specification.

It is fine to mention risks, smells, or suspicious areas, but keep them as notes unless the user asks to act.

### 6. Produce the Codebase Map

Output:

```md
# Codebase Understanding Map

## Question / Scope
<what was investigated>

## Short Answer
<the useful high-level explanation in a few sentences>

## Key Files and Modules
- `<path>` — <why it matters>

## Flow
<call flow, data flow, state transitions, or lifecycle>

## Domain Language
- <project term> — <where it appears in code and what it means>

## Boundaries and Seams
<APIs, adapters, persistence boundaries, external systems, test seams>

## Tests / Validation Clues
<tests, fixtures, commands, or missing coverage relevant to understanding behavior>

## Unknowns and Caveats
<what is not yet proven, missing docs, ambiguous names, or assumptions>

## Where To Look Next
<small set of next files/questions depending on what the user wants to do>
```

Keep the report compact. The goal is orientation, not exhaustive documentation.
