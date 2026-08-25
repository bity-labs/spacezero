# UI

`@spacezero/ui` is Space Zero's browser-safe React UI package.

It owns domain-free shadcn-compatible primitives, shared visual components, high-fidelity mock screens, the canonical Space Zero theme tokens, and the local Storybook workbench used for visual contracts.

## Responsibilities

- React/TypeScript presentation components only.
- shadcn/ui-compatible primitives and composition patterns.
- Tailwind CSS v4 theme tokens generated from the approved shadcn preset `b7BYR9Xec` (`vega`, `mist`, Inter, Phosphor, medium radius).
- Package-local Storybook stories for primitives, reusable components, and future high-fidelity mock screens.

## Boundaries

This package must remain browser-safe and runtime-free. Do not import Electron, Node.js filesystem/process APIs, Client Runtime, Host Contracts, Effect, Pi, SQLite, preload APIs, or application source.

Consumers import public exports only:

```ts
import { Button, Dialog, Input } from "@spacezero/ui";
import "@spacezero/ui/styles.css";
```

The package is private and source-exported for the pnpm monorepo. Vite/Tailwind consumers compile its `src` files and `styles.css` Tailwind v4 entrypoint directly; there is no library bundle, precompiled CSS, or `dist` output yet.

## Commands

```bash
pnpm --filter @spacezero/ui typecheck
pnpm --filter @spacezero/ui test
pnpm --filter @spacezero/ui storybook
pnpm --filter @spacezero/ui storybook:check
pnpm --filter @spacezero/ui storybook:build
```

Root aliases are also available:

```bash
pnpm storybook
pnpm storybook:check
pnpm storybook:build
```
