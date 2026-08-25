# @spacezero/ui

Browser-safe, domain-free React UI primitives for Space Zero.

Uses shadcn + Tailwind CSS v4 with official Space Zero preset `b7BYR9Xec` (Vega/Mist). Treat generated preset variables in `src/styles/globals.css` as authoritative.

Consumer imports:

```ts
import "@spacezero/ui/globals.css";
import { Button } from "@spacezero/ui/components/button";
```

`globals.css` is a Tailwind v4 source entrypoint, not precompiled CSS.
