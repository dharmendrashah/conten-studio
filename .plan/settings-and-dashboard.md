# Settings (AI providers) and dashboard shell

Status: planning. Recommended answers are marked as such.

## Goal
1. A `/settings` page where a user adds multiple AI providers with their API keys and picks one default provider.
2. A dashboard shell (shadcn `dashboard-01` block) that becomes the home of every studio page, with real pipeline stats replacing the block's sample data.

## Layout

```
+----------------------------------------------------------------------+
| [logo] Content Studio                                  [user menu]   |
+------------------+---------------------------------------------------+
| Dashboard        |  Settings                                         |
| VSL              |  +---------------------------------------------+  |
| Content          |  | AI providers                 [+ Add provider]|  |
| Assemble         |  | Default: OpenAI (Work)                       |  |
| Export           |  +---------------------------------------------+  |
| ---------------- |  | Label        Provider    Key       Default  |  |
| Settings         |  | Work         OpenAI      sk-...a3f2  (x)   |  |
|                  |  |                          [Test][Edit][Del]  |  |
|                  |  | Personal     Anthropic   sk-...9c1e         |  |
|                  |  |                          [Set default]...   |  |
|                  |  +---------------------------------------------+  |
+------------------+---------------------------------------------------+
```

### Add provider dialog
- Provider: select from the adapter catalog (`src/lib/ai`).
- Label: free text, unique per user (e.g. "Work", "Client A").
- API key: password input with show/hide. Never echoed back after save.
- Buttons: Test connection, Save.

### Dashboard home (after cleanup)
- Stat cards: VSL locked version, content items, assets generated, default AI provider.
- Pipeline progress row: VSL -> Content -> Assemble -> Export, with status per stage.
- Recent activity table (real data only, once the pipeline exists).
- The block ships with sample charts and table data. Remove all of it before merging.

## Data model (additive Prisma migration)
```
AiProvider
  id            String   @id @default(cuid())
  label         String   @unique
  kind          AiProviderKind   // enum of adapter ids
  encryptedKey  String           // AES-256-GCM, never plaintext
  keyLast4      String
  isDefault     Boolean  @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
```

## Rules
- Keys are encrypted at rest. The encryption key comes from `SETTINGS_ENCRYPTION_KEY` in `.env`. Add the variable name to `.env.example` only, never a value.
- Keys never leave the server. The UI receives `keyLast4` only.
- Exactly one provider has `isDefault = true`. Change it in one transaction.
- Repository in `src/features/settings/repository.ts`. Server actions in `src/features/settings/actions.ts` validate input with a schema.
- Keys are never logged or included in error messages.

## Phases
### P1: Dashboard shell
- Install `dashboard-01` with the shadcn CLI.
- Route group `src/app/(dashboard)/` with the shell layout.
- Sidebar nav: Dashboard, VSL, Content, Assemble, Export, Settings.
- Remove sample data.

### P2: Provider storage
- Prisma model and migration (additive).
- Crypto helper in `src/lib/crypto/` with tests written first.
- Repository and server actions: list, add, update label or key, delete, set default.

### P3: Settings UI
- Provider table, add/edit dialog, delete confirmation, default selector.
- Test connection action calls the adapter's cheapest call (model list or ping).

### P4: Dashboard home
- Stat cards and pipeline progress from real data.
- Default provider shown in the header.

## Open questions (recommended answer in brackets)
1. Which providers at launch? [OpenAI, Anthropic, Google Gemini. Add others when an adapter exists.]
2. Multiple keys for one provider? [Yes, each with a unique label.]
3. Delete the current default? [Block it. The user must pick a new default first.]
4. Test connection on save? [Optional button, not automatic. Saving must work offline.]
5. Encryption key handling? [Required env var with no fallback. Fail fast at startup if missing.]
6. Auth? [Settings hold secrets. Add login before any deployment, even though v1 is single-user locally.]
