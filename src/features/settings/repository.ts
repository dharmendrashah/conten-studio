import type { AiProviderKind, AiUseCase, PrismaClient } from "@/generated/prisma/client";

export type SettingsErrorCode =
  | "NOT_FOUND"
  | "LABEL_TAKEN"
  | "DEFAULT_PROVIDER_IN_USE"
  | "CONNECTION_FAILED"
  | "MODEL_NOT_AVAILABLE";

export class SettingsError extends Error {
  constructor(
    readonly code: SettingsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SettingsError";
  }
}

export type PublicProvider = {
  id: string;
  label: string;
  kind: AiProviderKind;
  keyLast4: string;
  isDefault: boolean;
  lastTestedAt: Date | null;
  lastTestOk: boolean | null;
  defaultModel: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type NewProvider = {
  label: string;
  kind: AiProviderKind;
  encryptedKey: string;
  keyLast4: string;
};

export type ProviderPatch = Partial<NewProvider>;

type ProviderDb = Pick<PrismaClient, "aiProvider">;
type ProviderRow = PublicProvider & { encryptedKey: string };

function toPublic(row: ProviderRow): PublicProvider {
  return {
    id: row.id,
    label: row.label,
    kind: row.kind,
    keyLast4: row.keyLast4,
    isDefault: row.isDefault,
    lastTestedAt: row.lastTestedAt,
    lastTestOk: row.lastTestOk,
    defaultModel: row.defaultModel,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function guardLabel<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      throw new SettingsError("LABEL_TAKEN", "A provider with this label already exists");
    }
    throw error;
  }
}

async function findOrThrow(db: ProviderDb, id: string): Promise<ProviderRow> {
  const row = await db.aiProvider.findUnique({ where: { id } });
  if (!row) throw new SettingsError("NOT_FOUND", "Provider not found");
  return row;
}

export async function listProviders(db: PrismaClient): Promise<PublicProvider[]> {
  const rows = await db.aiProvider.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map(toPublic);
}

export async function createProvider(db: PrismaClient, input: NewProvider): Promise<PublicProvider> {
  return db.$transaction(async (tx) => {
    const existing = await tx.aiProvider.count();
    const row = await guardLabel(
      tx.aiProvider.create({ data: { ...input, isDefault: existing === 0 } }),
    );
    return toPublic(row);
  });
}

export async function updateProvider(
  db: PrismaClient,
  id: string,
  patch: ProviderPatch,
): Promise<PublicProvider> {
  await findOrThrow(db, id);
  const row = await guardLabel(db.aiProvider.update({ where: { id }, data: patch }));
  return toPublic(row);
}

export async function deleteProvider(db: PrismaClient, id: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const row = await findOrThrow(tx, id);
    const total = await tx.aiProvider.count();
    if (row.isDefault && total > 1) {
      throw new SettingsError("DEFAULT_PROVIDER_IN_USE", "Choose another default before deleting this provider");
    }
    await tx.aiProvider.delete({ where: { id } });
  });
}

export async function setDefaultProvider(db: PrismaClient, id: string): Promise<PublicProvider> {
  return db.$transaction(async (tx) => {
    await findOrThrow(tx, id);
    await tx.aiProvider.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    const row = await tx.aiProvider.update({ where: { id }, data: { isDefault: true } });
    return toPublic(row);
  });
}

export type ProviderSecret = { kind: AiProviderKind; encryptedKey: string };

export async function getProviderSecret(db: PrismaClient, id: string): Promise<ProviderSecret> {
  const row = await findOrThrow(db, id);
  return { kind: row.kind, encryptedKey: row.encryptedKey };
}

export async function recordTestResult(
  db: PrismaClient,
  id: string,
  ok: boolean,
  testedAt: Date,
): Promise<PublicProvider> {
  await findOrThrow(db, id);
  const row = await db.aiProvider.update({
    where: { id },
    data: { lastTestOk: ok, lastTestedAt: testedAt },
  });
  return toPublic(row);
}

export async function setProviderModel(db: PrismaClient, id: string, model: string): Promise<PublicProvider> {
  await findOrThrow(db, id);
  const row = await db.aiProvider.update({ where: { id }, data: { defaultModel: model } });
  return toPublic(row);
}

export type UseCaseDefault = { useCase: AiUseCase; providerId: string; model: string };

export async function listUseCaseDefaults(db: PrismaClient): Promise<UseCaseDefault[]> {
  const rows = await db.useCaseDefault.findMany();
  return rows.map(({ useCase, providerId, model }) => ({ useCase, providerId, model }));
}

export async function setUseCaseDefault(db: PrismaClient, input: UseCaseDefault): Promise<void> {
  const { useCase, providerId, model } = input;
  await findOrThrow(db, providerId);
  await db.useCaseDefault.upsert({
    where: { useCase },
    create: { useCase, providerId, model },
    update: { providerId, model },
  });
}
