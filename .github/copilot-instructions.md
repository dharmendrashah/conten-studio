# Copilot instructions: Content Studio

Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, shadcn primitives, Prisma 7 on PostgreSQL.

## Read first
- [AGENTS.md](../AGENTS.md): Next.js 16 breaking changes. Read `node_modules/next/dist/docs/` before writing Next.js code.
- [agent.md](../agent.md): architecture layers and project rules.
- [memory.md](../memory.md): product context, decisions, gotchas.
- [.plan/](../.plan/): check for an existing plan before starting a feature.

## Principles
- SOLID where it reduces real coupling. Reject premature abstraction.
- YAGNI: build only the current phase.
- KISS: prefer plain functions and server modules.
- Say what was skipped and why when declining an abstraction.

## Structure
- `src/app/`: routes only. Thin pages that compose feature modules.
- `src/features/<stage>/`: domain logic per stage (vsl, content, assemble, export).
- `src/lib/ai/`, `src/lib/storage/`: interfaces and adapters.
- `src/lib/db.ts`: Prisma client singleton.
- `src/components/ui/`: shadcn primitives. No feature logic.

## Coding rules
- Server components by default. Add `"use client"` only where state or browser APIs are needed.
- Validate all external input at the boundary: route handlers, server actions, AI output.
- Route handlers and server actions are the only server entry points.
- Data access goes through a repository. Components never call Prisma or AI directly.
- Tests are co-located as `*.spec.ts` / `*.spec.tsx`. Write the test first.
- Do not edit generated Prisma code in `src/generated/prisma`.

## Data and safety
- Schema changes are additive migrations only.
- Never run `prisma migrate reset`, `DROP SCHEMA`, or `db push --force-reset`.
- Never read, print, or commit `.env` or secrets.
- Locked VSL versions are immutable. Downstream stages reference locked versions only.

## Verification
```
npx tsc --noEmit && npx eslint src && npx jest --silent
```

## Output
- Minimal diffs. One concern per change.
- Do not create markdown files documenting changes unless asked.
