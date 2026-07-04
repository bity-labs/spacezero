---
name: debug
description: Disciplined debugging loop for hard bugs and performance regressions. Use when the user says something is broken, throwing, failing, or describes a performance regression.
---

# Debug

Find the root cause of a bug or performance regression with evidence, fix it, and add regression coverage.

## Read These First

1. `docs/engineering/debugging.md` — principles and rules
2. `docs/engineering/tdd.md` — for regression test writing
3. `docs/coding-standards.md` — repo conventions
4. `docs/context.md` — domain language
5. Relevant `docs/adr/` files for the area being touched

## Workflow

### 1. Build a Feedback Loop

**This is the skill.** Everything else is mechanical. A fast, deterministic, agent-runnable pass/fail signal for the bug makes the rest straightforward. Without one, no amount of staring at code will help.

Spend disproportionate effort here.

Try these in roughly this order:

1. **Failing test** at whatever seam reaches the bug.
2. **Curl / HTTP script** against a running dev server.
3. **CLI invocation** with a fixture input, diffing stdout against a known-good snapshot.
4. **Headless browser script** (Playwright / Puppeteer) driving the UI.
5. **Replay a captured trace.** Save a real request / payload / event log to disk; replay it through the code path in isolation.
6. **Throwaway harness.** Spin up a minimal subset of the system that exercises the bug path with a single function call.
7. **Property / fuzz loop.** If the bug is "sometimes wrong output", run random inputs and look for the failure mode.
8. **Bisection harness.** If the bug appeared between two known states, automate "boot at state X, check, repeat" so you can `git bisect run` it.
9. **Differential loop.** Run the same input through old-version vs new-version and diff outputs.
10. **HITL bash script.** Last resort. If a human must click, drive them with a structured script so the loop is still organized.

Once you have a loop, sharpen it:

- Can I make it faster? (Cache setup, skip unrelated init, narrow scope.)
- Can I make the signal sharper? (Assert on the specific symptom, not "didn't crash".)
- Can I make it more deterministic? (Pin time, seed RNG, isolate filesystem, freeze network.)

For non-deterministic bugs, raise the reproduction rate until it is debuggable. Loop the trigger 100×, parallelise, add stress, narrow timing windows. A 50%-flake bug is debuggable; 1% is not.

If you genuinely cannot build a loop, stop and say so. List what you tried. Ask the user for access to the environment, a captured artifact, or permission to add temporary instrumentation.

Do not proceed to Phase 2 until you have a loop you believe in.

### 2. Reproduce

Run the loop. Confirm:

- [ ] The loop produces the failure the **user** described — not a different failure nearby.
- [ ] The failure is reproducible across multiple runs (or at a high enough rate for non-deterministic bugs).
- [ ] You have captured the exact symptom so later phases can verify the fix.

Do not proceed until the bug is reproduced.

### 3. Hypothesise

Generate **3–5 ranked hypotheses** before testing any of them. Single-hypothesis generation anchors on the first plausible idea.

Each hypothesis must be **falsifiable**.

> Format: "If <X> is the cause, then <changing Y> will make the bug disappear / <changing Z> will make it worse."

If the user is present (HITL), show the ranked list before testing. They may have domain knowledge that re-ranks instantly or know hypotheses already ruled out.
If running unattended (AFK), proceed with your ranking.

### 4. Instrument

Each probe must map to a specific prediction from Phase 3. Change one variable at a time.

Tool preference:

1. **Debugger / REPL inspection** if the env supports it.
2. **Targeted logs** at the boundaries that distinguish hypotheses.
3. Never "log everything and grep".

Tag every debug log with a unique prefix, e.g. `[DEBUG-a4f2]`. Cleanup later becomes a single grep. Untagged logs survive; tagged logs die.

For performance regressions, establish a baseline measurement first, then bisect. Measure first, fix second.

### 5. Fix + Regression Test

Write the regression test **before the fix** — but only if there is a **correct seam** for it.

A correct seam is one where the test exercises the **real bug pattern** as it occurs at the call site. If the only available seam is too shallow, a regression test there gives false confidence.

If no correct seam exists, note it. The codebase architecture is preventing the bug from being locked down. Flag this for later.

If a correct seam exists:

1. Turn the minimised repro into a failing test at that seam.
2. Watch it fail.
3. Apply the fix.
4. Watch it pass.
5. Re-run the Phase 1 feedback loop against the original scenario.

### 6. Cleanup + Post-Mortem

Required before declaring done:

- [ ] Original repro no longer reproduces (re-run the Phase 1 loop).
- [ ] Regression test passes (or absence of seam is documented).
- [ ] All `[DEBUG-...]` instrumentation removed.
- [ ] Throwaway prototypes deleted or moved to a clearly-marked debug location.
- [ ] The correct hypothesis is stated in the commit / PR message.

Then ask: what would have prevented this bug? If the answer involves architectural change — no good test seam, tangled callers, hidden coupling — note the specifics for the next improvement cycle.
