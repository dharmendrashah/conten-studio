# Content Studio pipeline

Status: planning. No decisions locked yet. Recommended answers are marked as such.

## Goal
Generate video content with AI at each step. Lock the script. Assemble everything into a JSON manifest for Premiere Pro. Download the output as a ZIP.

## Pages
| Route | Purpose |
|---|---|
| `/vsl` | Generate VSL script, edit, lock version |
| `/content` | AI idea suggestions. Per item: user supplies content or AI generates assets |
| `/assemble` | Merge locked script, content items and assets into one manifest |
| `/export` | Premiere Pro JSON download and ZIP download of all files |

## Domain model (Prisma, additive)
- `Project`: id, name, createdAt.
- `VslScript`: id, projectId, version, body, status (`draft` | `locked`), lockedAt.
- `ContentItem`: id, projectId, title, kind, source (`user` | `ai`), status.
- `Asset`: id, contentItemId, type, storageKey, mimeType, sizeBytes, createdAt.
- `Manifest` is derived at export time. It is not stored in v1.

## Phases
### P0: Foundations
- Prisma models above and first migration.
- AI provider interface with one adapter stub.
- File storage interface with local adapter.
- Shared studio layout and navigation.
- Input validation library chosen and added.

### P1: VSL page
- Generate script from a brief via AI.
- Edit draft. Save creates a new version.
- Lock marks one version as `locked`. Unlock creates a new draft from it. Old versions are kept.

### P2: Content page
- AI suggests content ideas from the locked script.
- User accepts an idea, then either uploads content or requests AI generation.
- Generated assets are stored through the storage interface and linked to the content item.

### P3: Assemble and manifest
- Requires a locked VSL and at least one content item.
- Builds a versioned JSON manifest: script sections, ordered clips, asset paths, timings.
- Manifest schema is versioned from day one (`schemaVersion`).

### P4: Export
- Streams a ZIP containing the manifest JSON and all asset files.
- Download button on `/export`.

## Open questions (recommended answer in brackets)
1. Which AI provider and API key source? [One provider behind the interface. Key in `.env`, never committed.]
2. Which asset types in v1? [Images and text only. Voiceover and video generation later.]
3. Where are assets stored? [Local dev disk behind the storage interface. S3-compatible storage later.]
4. Is there authentication? [No auth in v1, single user. Add auth before any deployment.]
5. How does Premiere Pro consume the JSON? Premiere does not read arbitrary JSON natively. [Ship a companion ExtendScript or UXP import script with the manifest schema. Confirm with the user before P3.]
6. ZIP library? [Streaming ZIP library, chosen in P4. Avoid buffering the whole archive in memory.]
7. Should ideas be generated from the locked script only, or from the brief too? [Locked script only, so ideas stay consistent with what was approved.]

## Out of scope for now
- Team collaboration, roles, approvals.
- Direct upload to Premiere Pro or any cloud editor.
- Video rendering on the server.
