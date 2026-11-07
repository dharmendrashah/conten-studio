import { z } from "zod";

export type ProviderKind = "openai" | "anthropic" | "google" | "openrouter" | "github";

export type ConnectionResult = { ok: true } | { ok: false; reason: string };

type Probe = {
  testUrl: string;
  modelsUrl: string;
  headers: (apiKey: string) => Record<string, string>;
};

const TIMEOUT_MS = 10_000;

const probes: Record<ProviderKind, Probe> = {
  openai: {
    testUrl: "https://api.openai.com/v1/models",
    modelsUrl: "https://api.openai.com/v1/models",
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
  },
  anthropic: {
    testUrl: "https://api.anthropic.com/v1/models",
    modelsUrl: "https://api.anthropic.com/v1/models",
    headers: (apiKey) => ({ "x-api-key": apiKey, "anthropic-version": "2023-06-01" }),
  },
  google: {
    testUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    modelsUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    headers: (apiKey) => ({ "x-goog-api-key": apiKey }),
  },
  openrouter: {
    testUrl: "https://openrouter.ai/api/v1/key",
    modelsUrl: "https://openrouter.ai/api/v1/models",
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
  },
  github: {
    testUrl: "https://api.githubcopilot.com/models",
    modelsUrl: "https://api.githubcopilot.com/models",
    headers: () => ({}),
  },
};

export type ModelListResult = { ok: true; models: string[] } | { ok: false; reason: string };

const modelListSchemas = {
  openai: z.object({ data: z.array(z.object({ id: z.string() })) }).transform((body) => body.data.map((model) => model.id)),
  anthropic: z.object({ data: z.array(z.object({ id: z.string() })) }).transform((body) => body.data.map((model) => model.id)),
  openrouter: z.object({ data: z.array(z.object({ id: z.string() })) }).transform((body) => body.data.map((model) => model.id)),
  github: z.object({ data: z.array(z.object({ id: z.string() })) }).transform((body) => body.data.map((model) => model.id)),
  google: z
    .object({ models: z.array(z.object({ name: z.string() })) })
    .transform((body) => body.models.map((model) => model.name.replace(/^models\//, ""))),
};

type Sent = { ok: true; response: Response } | { ok: false; reason: string };

async function send(
  url: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch,
  rejectedReason: (status: number) => string = () => "The API key was rejected",
): Promise<Sent> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, reason: "Could not reach the provider" };
  }

  if (response.ok) return { ok: true, response };
  if (response.status === 401 || response.status === 403) {
    return { ok: false, reason: rejectedReason(response.status) };
  }
  return { ok: false, reason: `Provider responded with status ${response.status}` };
}

type Auth = { ok: true; headers: Record<string, string> } | { ok: false; reason: string };

const COPILOT_HEADERS = { "Editor-Version": "vscode/1.99.0", "Copilot-Integration-Id": "vscode-chat" };
const copilotTokenSchema = z.object({ token: z.string().min(1) });

async function copilotAuth(oauthToken: string, fetchImpl: typeof fetch): Promise<Auth> {
  const sent = await send(
    "https://api.github.com/copilot_internal/v2/token",
    { Authorization: `token ${oauthToken}`, Accept: "application/json" },
    fetchImpl,
    (status) =>
      status === 401
        ? `GitHub sign-in expired or was revoked (HTTP ${status}). Sign in again.`
        : `GitHub denied Copilot access (HTTP ${status}). Check that this account has an active Copilot subscription.`,
  );
  if (!sent.ok) return sent;
  const parsed = copilotTokenSchema.safeParse(await sent.response.json().catch(() => null));
  if (!parsed.success) return { ok: false, reason: "Unexpected response from GitHub" };
  return { ok: true, headers: { Authorization: `Bearer ${parsed.data.token}`, ...COPILOT_HEADERS } };
}

async function authFor(kind: ProviderKind, apiKey: string, fetchImpl: typeof fetch): Promise<Auth> {
  if (kind === "github") return copilotAuth(apiKey, fetchImpl);
  return { ok: true, headers: probes[kind].headers(apiKey) };
}

export async function testProviderConnection(
  kind: ProviderKind,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ConnectionResult> {
  const auth = await authFor(kind, apiKey, fetchImpl);
  if (!auth.ok) return auth;
  const sent = await send(probes[kind].testUrl, auth.headers, fetchImpl);
  return sent.ok ? { ok: true } : { ok: false, reason: sent.reason };
}

export async function listProviderModels(
  kind: ProviderKind,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ModelListResult> {
  const auth = await authFor(kind, apiKey, fetchImpl);
  if (!auth.ok) return auth;
  const sent = await send(probes[kind].modelsUrl, auth.headers, fetchImpl);
  if (!sent.ok) return sent;
  const parsed = modelListSchemas[kind].safeParse(await sent.response.json().catch(() => null));
  if (!parsed.success) return { ok: false, reason: "Unexpected response from provider" };
  return { ok: true, models: parsed.data };
}
