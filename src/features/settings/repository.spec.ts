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
    $transaction: <T>(fn: (tx: typeof db) => Promise<T>) => Promise<T>;
  } = {
    aiProvider,
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
});
