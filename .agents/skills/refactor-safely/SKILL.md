---
name: refactor-safely
description: Apply a scoped refactor while preserving behavior. Use when the user wants to improve structure, reduce coupling, deepen a module, move code behind a seam, or clean up design without changing what the system does.
---

# Refactor Safely

Refactor one scoped area without changing observable behavior unless the user explicitly asks for a behavior change.

## Read These First

1. `docs/engineering/refactoring.md` — safe refactoring rules
2. `docs/engineering/testing.md` — characterization and behavior coverage
3. `docs/engineering/interface-design.md` — seams and public interfaces
4. `docs/engineering/deep-modules.md` — module depth and interface leverage
5. `docs/engineering/architecture-boundaries.md` — ownership and boundaries
6. `docs/coding-standards.md` — repo conventions and validation commands
7. `docs/context.md` and relevant `docs/adr/` files when domain or architecture decisions are involved

## Workflow

### 1. Confirm Scope

Before editing, understand the refactor target.

Clarify:

- what code or behavior is in scope
- what pain the refactor should reduce
- what must not change
- whether public interfaces may change
- what validation should prove success

If the scope is broad or vague, narrow it to one behavior-preserving improvement.

If the user is present, restate the scope and wait for approval. If unattended, proceed only when the requested scope is already clear.

### 2. Understand Current Behavior

Read the target code and nearby callers/callees.

Identify:

- public interfaces callers rely on
- domain terms and invariants
- ordering requirements
- error modes
- side effects
- existing tests
- risky untested behavior

Do not start moving code until you know what behavior must be preserved.

### 3. Characterize Before Changing

If existing tests do not protect the behavior affected by the refactor, add characterization coverage first.

Good characterization tests:

- exercise observable behavior through stable interfaces
- document current behavior, including edge cases
- avoid private implementation details
- cover the risky path the refactor will touch

Run the characterization tests and confirm they pass before changing production code.

If no correct test seam exists, make the smallest safe structural change needed to create one, and call out the risk.

### 4. Plan Tiny Steps

Create a small-step plan.

Each step should be:

- behavior-preserving
- easy to review
- reversible
- validated by tests, typecheck, or another fast signal
- scoped to the current refactor only

Example:

```md
## Refactor Plan

1. Add characterization tests around <behavior>.
2. Introduce <new seam/interface> without changing callers.
3. Move <behavior> behind the seam.
4. Update one caller group at a time.
5. Remove obsolete pass-through code.
6. Run full validation.
```

Never mix unrelated cleanup into the plan.

### 5. Refactor From Green to Green

Apply one small change at a time.

For each step:

1. Start from green.
2. Make the smallest structural change.
3. Run the narrowest useful validation.
4. Return to green before continuing.

Rules:

- Do not refactor while tests are failing for unknown reasons.
- Do not change behavior silently.
- Do not introduce speculative abstractions.
- Do not rename or reformat unrelated code.
- Do not widen public interfaces unless the scope requires it.
- Prefer moving behavior behind a clearer seam over scattering new conditionals.

### 6. Validate the Result

Run validation appropriate to the touched area:

- characterization tests
- targeted tests
- broader test suite when reasonable
- typecheck
- lint
- build

Then compare the final shape against the original goal:

- Is the behavior preserved?
- Is caller burden lower?
- Is the test surface better?
- Is the code easier to change for the intended reason?
- Did the refactor stay inside scope?

### 7. Report Back

Final output:

```md
## Refactor Summary

What changed:
- <structural change>

Behavior preservation:
- <tests or evidence proving behavior stayed the same>

Validation:
- ✅/❌ <command> — <result>

Scope control:
- <what was intentionally not changed>

Follow-up:
- <remaining risk or next safe improvement, if any>
```

## Guardrails

- Preserve behavior unless behavior change is explicitly requested.
- Add characterization coverage before risky structural changes.
- Work in tiny green steps.
- Keep the refactor scoped to one purpose.
- Do not perform broad architecture discovery inside this skill.
- Do not use refactoring as an excuse to add features.
- If the safest move is to stop and ask for clarification, stop.
