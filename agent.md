# Agent guide: Content Studio

Read [AGENTS.md](AGENTS.md) first for the Next.js 16 rules. Read [memory.md](memory.md) for product context and decisions. Check [.plan/](.plan/) before starting any feature.

## Principles
- SOLID where it earns its keep. Keep modules small and single-purpose. Depend on interfaces at the AI and storage boundaries only.
- YAGNI. Build only the current phase. No provider, storage or asset-type abstractions beyond what a phase needs.
- KISS. Prefer plain functions and server modules over frameworks or patterns.
- DRY judgmentally. Extract shared behavior, keep distinct shapes inline.

## Architecture
- `src/app/`: routes only. Thin pages that compose feature modules. Route groups per pipeline stage.
- `src/features/<stage>/`: domain logic for each stage (VSL, content, assemble, export). Components, server actions, and pure functions live here.
- `src/lib/ai/`: AI provider interface and adapters.
- `src/lib/storage/`: file storage interface and adapters.
- `src/lib/db.ts`: Prisma client singleton.
- `src/components/ui/`: shadcn primitives. Do not put feature logic here.
- Server components by default. Add `"use client"` only where state or browser APIs are needed.

## Rules
- Plans go in `.plan/<feature>.md`. Do not store plans in session memory.
- Tests are co-located as `*.spec.ts` next to the source. Write the test first.
- Validate all external input (route handlers, server actions, AI output) at the boundary.
- Schema changes are additive migrations. Never reset the database.
- Never read or print `.env`. Never commit secrets.
- Do not create markdown docs for changes unless asked.

## Agents
Developer agents are in [.github/agents/](.github/agents/):
- `nextjs-architect`: plans, boundaries, reviews. Does not write feature code.
- `nextjs-ui-developer`: pages, components, client state.
- `nextjs-api-developer`: route handlers, server actions, Prisma data access.
- `ai-pipeline-developer`: AI adapters, prompts, lock semantics, manifest and ZIP export.

## Verification
- `npx tsc --noEmit && npx eslint src && npx jest --silent`
