# Private Handbook

This is a private Fumadocs application for the product owner’s human-oriented engineering handbook.

The handbook explains how Space Zero works through architecture notes, system walkthroughs, implementation status, release-process explanations, and operational guides. It may reference normative repository documentation, but it must not redefine architectural rules differently from `docs/`.

## Commands

```bash
pnpm --filter @spacezero/handbook dev
pnpm --filter @spacezero/handbook build
pnpm --filter @spacezero/handbook typecheck
```

The local dev server runs on port `3010`.
