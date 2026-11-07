import type { PrismaClient } from "@/generated/prisma/client";
import {
  createProvider,
  deleteProvider,
  listProviders,
  setDefaultProvider,
  SettingsError,
  updateProvider,
  getProviderSecret,
  recordTestResult,
  setProviderModel,
  listUseCaseDefaults,
  setUseCaseDefault,
} from "./repository";

type Row = {
  id: string;
  label: string;
  kind: "openai" | "anthropic" | "google";
  encryptedKey: string;
  keyLast4: string;
  isDefault: boolean;
  lastTestedAt: Date | null;
  lastTestOk: boolean | null;
  defaultModel: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function uniqueViolation() {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}

function fakeDb() {
  const rows: Row[] = [];
  let seq = 0;
  const find = (id: string) => rows.find((r) => r.id === id) ?? null;
  const useCaseRows: { useCase: string; providerId: string; model: string }[] = [];

  const useCaseDefault = {
    findMany: async () => useCaseRows.map((r) => ({ ...r })),
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { useCase: string };
      create: { useCase: string; providerId: string; model: string };
      update: { providerId: string; model: string };
    }) => {
      const existing = useCaseRows.find((r) => r.useCase === where.useCase);
      if (existing) {
        Object.assign(existing, update);
        return { ...existing };
      }
      const row = { ...create };
      useCaseRows.push(row);
      return { ...row };
    },
  };

  const aiProvider = {
    findMany: async () => rows.map((r) => ({ ...r })),
    findUnique: async ({ where }: { where: { id: string } }) => {
      const row = find(where.id);
      return row ? { ...row } : null;
    },
    count: async () => rows.length,
    create: async ({ data }: { data: Omit<Row, "id" | "createdAt" | "updatedAt" | "lastTestedAt" | "lastTestOk" | "defaultModel"> }) => {
      if (rows.some((r) => r.label === data.label)) throw uniqueViolation();
      const row: Row = {
        ...data,
        id: `p${++seq}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastTestedAt: null,
        lastTestOk: null,
        defaultModel: null,
      };
      rows.push(row);
      return { ...row };
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
      const row = find(where.id);
      if (!row) throw Object.assign(new Error("Record not found"), { code: "P2025" });
      if (data.label && rows.some((r) => r !== row && r.label === data.label)) throw uniqueViolation();
      Object.assign(row, data, { updatedAt: new Date() });
      return { ...row };
    },
    updateMany: async ({ where, data }: { where: { isDefault: boolean }; data: Partial<Row> }) => {
      const matched = rows.filter((r) => r.isDefault === where.isDefault);
      matched.forEach((r) => Object.assign(r, data));
      return { count: matched.length };
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const index = rows.findIndex((r) => r.id === where.id);
      const [removed] = rows.splice(index, 1);
      return { ...removed };
    },
  };

  const db: {
    aiProvider: typeof aiProvider;
    useCaseDefault: typeof useCaseDefault;
    $transaction: <T>(fn: (tx: typeof db) => Promise<T>) => Promise<T>;
  } = {
    aiProvider,
    useCaseDefault,
    $transaction: async (fn) => fn(db),
  };
  return db as unknown as PrismaClient;
}

const input = (label: string) => ({
  label,
  kind: "openai" as const,
  encryptedKey: `cipher-${label}`,
  keyLast4: "a3f2",
});

async function expectSettingsError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
  await expect(promise).rejects.toBeInstanceOf(SettingsError);
}

describe("settings repository", () => {
  it("lists providers without the encrypted key", async () => {
    const db = fakeDb();
    await createProvider(db, input("Work"));
    const [provider] = await listProviders(db);
    expect(provider).toMatchObject({ label: "Work", keyLast4: "a3f2" });
    expect(provider).not.toHaveProperty("encryptedKey");
  });

  it("makes the first provider the default and leaves later ones non-default", async () => {
    const db = fakeDb();
    const first = await createProvider(db, input("Work"));
    const second = await createProvider(db, input("Personal"));
    expect(first.isDefault).toBe(true);
    expect(second.isDefault).toBe(false);
  });

  it("rejects a duplicate label", async () => {
    const db = fakeDb();
    await createProvider(db, input("Work"));
    await expectSettingsError(createProvider(db, input("Work")), "LABEL_TAKEN");
  });

  it("moves the default so exactly one provider is default", async () => {
    const db = fakeDb();
    const work = await createProvider(db, input("Work"));
    const personal = await createProvider(db, input("Personal"));
    await setDefaultProvider(db, personal.id);
    const defaults = (await listProviders(db)).filter((p) => p.isDefault);
    expect(defaults.map((p) => p.id)).toEqual([personal.id]);
    expect(work.id).not.toBe(personal.id);
  });

  it("refuses to delete the default while other providers exist", async () => {
    const db = fakeDb();
    const work = await createProvider(db, input("Work"));
    await createProvider(db, input("Personal"));
    await expectSettingsError(deleteProvider(db, work.id), "DEFAULT_PROVIDER_IN_USE");
  });

  it("deletes the default when it is the only provider", async () => {
    const db = fakeDb();
    const work = await createProvider(db, input("Work"));
    await deleteProvider(db, work.id);
    expect(await listProviders(db)).toHaveLength(0);
  });

  it("deletes a non-default provider", async () => {
    const db = fakeDb();
    await createProvider(db, input("Work"));
    const personal = await createProvider(db, input("Personal"));
    await deleteProvider(db, personal.id);
    expect((await listProviders(db)).map((p) => p.label)).toEqual(["Work"]);
  });

  it("updates the label and key metadata of a provider", async () => {
    const db = fakeDb();
    const work = await createProvider(db, input("Work"));
    const updated = await updateProvider(db, work.id, { label: "Client A", keyLast4: "9c1e" });
    expect(updated).toMatchObject({ label: "Client A", keyLast4: "9c1e" });
  });

  it("reports NOT_FOUND for an unknown provider", async () => {
    const db = fakeDb();
    await expectSettingsError(updateProvider(db, "missing", { label: "X" }), "NOT_FOUND");
    await expectSettingsError(deleteProvider(db, "missing"), "NOT_FOUND");
    await expectSettingsError(setDefaultProvider(db, "missing"), "NOT_FOUND");
    await expectSettingsError(getProviderSecret(db, "missing"), "NOT_FOUND");
    await expectSettingsError(recordTestResult(db, "missing", true, new Date()), "NOT_FOUND");
    await expectSettingsError(setProviderModel(db, "missing", "gpt-4o"), "NOT_FOUND");
  });

  it("stores the chosen default model without changing the default provider", async () => {
    const db = fakeDb();
    const work = await createProvider(db, input("Work"));
    const personal = await createProvider(db, input("Personal"));
    await setProviderModel(db, personal.id, "gpt-4o");
    const providers = await listProviders(db);
    expect(providers.find((p) => p.id === personal.id)).toMatchObject({ defaultModel: "gpt-4o", isDefault: false });
    expect(providers.find((p) => p.id === work.id)).toMatchObject({ defaultModel: null, isDefault: true });
  });

  it("returns the kind and encrypted key for a connection test", async () => {
    const db = fakeDb();
    const work = await createProvider(db, input("Work"));
    await expect(getProviderSecret(db, work.id)).resolves.toEqual({
      kind: "openai",
      encryptedKey: "cipher-Work",
    });
  });

  it("records the outcome of the last connection test", async () => {
    const db = fakeDb();
    const work = await createProvider(db, input("Work"));
    const testedAt = new Date("2026-11-07T10:00:00Z");
    await recordTestResult(db, work.id, false, testedAt);
    const [provider] = await listProviders(db);
    expect(provider).toMatchObject({ lastTestOk: false, lastTestedAt: testedAt });
  });

  it("starts a new provider with no test result", async () => {
    const db = fakeDb();
    const work = await createProvider(db, input("Work"));
    expect(work).toMatchObject({ lastTestOk: null, lastTestedAt: null });
  });

  it("stores a default provider and model for a use case", async () => {
    const db = fakeDb();
    const work = await createProvider(db, input("Work"));
    await setUseCaseDefault(db, { useCase: "image", providerId: work.id, model: "dall-e-3" });
    await expect(listUseCaseDefaults(db)).resolves.toEqual([
      { useCase: "image", providerId: work.id, model: "dall-e-3" },
    ]);
  });

  it("replaces the provider and model for one use case without touching the others", async () => {
    const db = fakeDb();
    const work = await createProvider(db, input("Work"));
    const personal = await createProvider(db, input("Personal"));
    await setUseCaseDefault(db, { useCase: "llm", providerId: work.id, model: "gpt-4o" });
    await setUseCaseDefault(db, { useCase: "tts", providerId: work.id, model: "tts-1" });
    await setUseCaseDefault(db, { useCase: "llm", providerId: personal.id, model: "claude-sonnet-5" });
    const defaults = await listUseCaseDefaults(db);
    expect(defaults).toHaveLength(2);
    expect(defaults).toContainEqual({ useCase: "llm", providerId: personal.id, model: "claude-sonnet-5" });
    expect(defaults).toContainEqual({ useCase: "tts", providerId: work.id, model: "tts-1" });
  });

  it("reports NOT_FOUND when the use-case provider does not exist", async () => {
    const db = fakeDb();
    await expectSettingsError(
      setUseCaseDefault(db, { useCase: "video", providerId: "missing", model: "veo-3" }),
      "NOT_FOUND",
    );
  });
});
