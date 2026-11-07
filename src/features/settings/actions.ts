"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { decryptSecret, encryptSecret, loadEncryptionKey } from "@/lib/crypto/secret-box";
import { listProviderModels, testProviderConnection } from "@/lib/ai/connection-test";
import { COPILOT_CLIENT_ID, pollDeviceFlow, startDeviceFlow } from "@/lib/github/device-flow";
import { db } from "@/lib/db";
import {
  createProvider,
  deleteProvider,
  getProviderSecret,
  type PublicProvider,
  recordTestResult,
  setDefaultProvider,
  SettingsError,
  setProviderModel,
  updateProvider,
} from "./repository";
import {
  createProviderSchema,
  keyLast4,
  providerIdSchema,
  githubPollSchema,
  setProviderModelSchema,
  updateProviderSchema,
} from "./schema";

export type ActionResult = { ok: true; provider?: PublicProvider } | { ok: false; error: string };

const GENERIC_ERROR = "Could not save settings. Check the server log.";

function encrypt(apiKey: string): string {
  return encryptSecret(apiKey, loadEncryptionKey(process.env));
}

async function run(work: () => Promise<PublicProvider | void>): Promise<ActionResult> {
  try {
    const provider = await work();
    return provider ? { ok: true, provider } : { ok: true };
  } catch (error) {
    if (error instanceof SettingsError) return { ok: false, error: error.message };
    console.error("settings action failed:", error instanceof Error ? error.message : "unknown error");
    return { ok: false, error: GENERIC_ERROR };
  } finally {
    revalidatePath("/settings");
  }
}

export async function addProviderAction(input: unknown): Promise<ActionResult> {
  const parsed = createProviderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { label, kind, apiKey } = parsed.data;
  return run(() =>
    createProvider(db, { label, kind, encryptedKey: encrypt(apiKey), keyLast4: keyLast4(apiKey) }),
  );
}

export async function updateProviderAction(input: unknown): Promise<ActionResult> {
  const parsed = updateProviderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { id, label, apiKey } = parsed.data;
  const keyPatch = apiKey ? { encryptedKey: encrypt(apiKey), keyLast4: keyLast4(apiKey) } : {};
  return run(() => updateProvider(db, id, { label, ...keyPatch }));
}

export async function deleteProviderAction(input: unknown): Promise<ActionResult> {
  const parsed = providerIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid provider" };
  return run(() => deleteProvider(db, parsed.data));
}

export async function setDefaultProviderAction(input: unknown): Promise<ActionResult> {
  const parsed = providerIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid provider" };
  return run(() => setDefaultProvider(db, parsed.data));
}

async function providerApiKey(id: string) {
  const { kind, encryptedKey } = await getProviderSecret(db, id);
  return { kind, apiKey: decryptSecret(encryptedKey, loadEncryptionKey(process.env)) };
}

export async function testProviderAction(input: unknown): Promise<ActionResult> {
  const parsed = providerIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid provider" };
  const id = parsed.data;
  return run(async () => {
    const { kind, apiKey } = await providerApiKey(id);
    const outcome = await testProviderConnection(kind, apiKey);
    await recordTestResult(db, id, outcome.ok, new Date());
    if (!outcome.ok) throw new SettingsError("CONNECTION_FAILED", outcome.reason);
  });
}

export type ModelsResult = { ok: true; models: string[] } | { ok: false; error: string };

export async function loadProviderModelsAction(input: unknown): Promise<ModelsResult> {
  const parsed = providerIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid provider" };
  try {
    const { kind, apiKey } = await providerApiKey(parsed.data);
    const result = await listProviderModels(kind, apiKey);
    return result.ok ? { ok: true, models: result.models } : { ok: false, error: result.reason };
  } catch (error) {
    if (error instanceof SettingsError) return { ok: false, error: error.message };
    console.error("settings action failed:", error instanceof Error ? error.message : "unknown error");
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function setProviderModelAction(input: unknown): Promise<ActionResult> {
  const parsed = setProviderModelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { id, model } = parsed.data;
  return run(async () => {
    const { kind, apiKey } = await providerApiKey(id);
    const result = await listProviderModels(kind, apiKey);
    if (!result.ok) throw new SettingsError("CONNECTION_FAILED", result.reason);
    if (!result.models.includes(model)) {
      throw new SettingsError("MODEL_NOT_AVAILABLE", "That model is not available for this provider");
    }
    await setProviderModel(db, id, model);
  });
}

const pendingSignInSchema = z.object({
  deviceCode: z.string().min(1),
  interval: z.number().positive(),
  expiresAt: z.number(),
});

export type SignInStart =
  | { ok: true; userCode: string; verificationUri: string; pendingToken: string; interval: number }
  | { ok: false; error: string };

export async function startGithubSignInAction(): Promise<SignInStart> {
  try {
    const started = await startDeviceFlow(COPILOT_CLIENT_ID);
    if (!started.ok) return { ok: false, error: started.reason };
    const { deviceCode, userCode, verificationUri, interval, expiresIn } = started.value;
    const pending = JSON.stringify({ deviceCode, interval, expiresAt: Date.now() + expiresIn * 1000 });
    return { ok: true, userCode, verificationUri, pendingToken: encrypt(pending), interval };
  } catch (error) {
    console.error("settings action failed:", error instanceof Error ? error.message : "unknown error");
    return { ok: false, error: GENERIC_ERROR };
  }
}

export type SignInPoll =
  | { ok: true; status: "pending"; interval: number }
  | { ok: true; status: "connected" }
  | { ok: false; error: string };

export async function pollGithubSignInAction(input: unknown): Promise<SignInPoll> {
  const parsed = githubPollSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { pendingToken, label } = parsed.data;
  try {
    const pending = pendingSignInSchema.parse(
      JSON.parse(decryptSecret(pendingToken, loadEncryptionKey(process.env))),
    );
    if (Date.now() > pending.expiresAt) return { ok: false, error: "Sign-in expired. Start again." };
    const outcome = await pollDeviceFlow(COPILOT_CLIENT_ID, pending.deviceCode, pending.interval);
    if (!outcome.ok) return { ok: false, error: outcome.reason };
    if (outcome.value.status === "pending") {
      return { ok: true, status: "pending", interval: outcome.value.interval };
    }
    const accessToken = outcome.value.accessToken;
    const check = await testProviderConnection("github", accessToken);
    if (!check.ok) return { ok: false, error: check.reason };
    await createProvider(db, {
      label,
      kind: "github",
      encryptedKey: encrypt(accessToken),
      keyLast4: keyLast4(accessToken),
    });
    revalidatePath("/settings");
    return { ok: true, status: "connected" };
  } catch (error) {
    if (error instanceof SettingsError) return { ok: false, error: error.message };
    console.error("settings action failed:", error instanceof Error ? error.message : "unknown error");
    return { ok: false, error: GENERIC_ERROR };
  }
}
