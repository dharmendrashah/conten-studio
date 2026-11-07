# Content Studio: project memory

Last updated: 2026-11-07. Status: scaffold only. No feature code yet.

## Product goal
AI-driven content generation pipeline for video production, with a final JSON handoff to Adobe Premiere Pro and a ZIP download of all files.

## Pipeline (separate pages)
1. VSL script: generate with AI, edit, lock.
2. Content and assets: AI suggests ideas. User supplies content or AI generates assets.
3. Assemble: merge locked script, content items and assets into one project manifest.
4. Export: Premiere Pro JSON manifest plus ZIP download.

Detailed phases and open questions: [.plan/content-studio-pipeline.md](.plan/content-studio-pipeline.md).

## Stack (as installed)
- Next.js 16.4.5 (App Router), React 19.3, TypeScript.
- Tailwind 4, shadcn-style UI in `src/components/ui`, `@base-ui/react`, `lucide-react`.
- Prisma 7.10 with `@prisma/adapter-pg`. Client generated to `src/generated/prisma`.
- ESLint 9 with `eslint-config-next`. React Compiler plugin installed.

## Decisions
- Locked VSL is versioned. Lock applies to one version. Unlock creates a new draft. Downstream stages reference a locked version only.
- AI provider sits behind an interface. Start with one adapter.
- File storage sits behind an interface. Start with local dev storage.
- Schema changes are additive migrations only.

## Gotchas
- Next.js 16 has breaking changes. Read `node_modules/next/dist/docs/` before writing Next code.
- Never `cd` into the repo while `.env` autoenv is active. Use absolute paths.
- Never hard-reset the database (`prisma migrate reset`, `DROP SCHEMA`, `db push --force-reset`).
- Use pnpm (matches `packageManager`). `pnpm-lock.yaml` is the source of truth. The stale `package-lock.json` is unused and can be deleted.
- pnpm 12 blocks Prisma build scripts until approved. `pnpm-workspace.yaml` `allowBuilds` covers `prisma` and `@prisma/engines`.
- Shell exports `NODE_ENV=development`. `pnpm build` then crashes in `/_global-error` prerender. Run builds with `env -u NODE_ENV pnpm build`.
- Premiere Pro does not import arbitrary JSON natively. The manifest needs a companion import script (ExtendScript or UXP). Confirm before finalizing the schema.

## Verification commands
- `npx tsc --noEmit && npx eslint src && npx jest --silent`
