import { z } from "zod";

export const COPILOT_CLIENT_ID = process.env.GITHUB_COPILOT_CLIENT_ID ?? "178c6fc778ccc68e1d6a";

const TIMEOUT_MS = 10_000;

export type FlowResult<T> = { ok: true; value: T } | { ok: false; reason: string };

export type DeviceCode = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval: number;
  expiresIn: number;
};

export type PollOutcome = { status: "pending"; interval: number } | { status: "connected"; accessToken: string };

const deviceCodeSchema = z.object({
  device_code: z.string(),
  user_code: z.string(),
  verification_uri: z.string(),
  interval: z.number(),
  expires_in: z.number(),
});

const tokenSchema = z.union([z.object({ access_token: z.string() }), z.object({ error: z.string() })]);

async function postForm(
  url: string,
  fields: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<{ ok: true; body: unknown } | { ok: false; reason: string }> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, reason: "Could not reach GitHub" };
  }
  if (!response.ok) return { ok: false, reason: `GitHub responded with status ${response.status}` };
  return { ok: true, body: await response.json().catch(() => null) };
}

export async function startDeviceFlow(
  clientId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FlowResult<DeviceCode>> {
  const sent = await postForm("https://github.com/login/device/code", { client_id: clientId, scope: "read:user" }, fetchImpl);
  if (!sent.ok) return sent;
  const parsed = deviceCodeSchema.safeParse(sent.body);
  if (!parsed.success) return { ok: false, reason: "Unexpected response from GitHub" };
  const data = parsed.data;
  return {
    ok: true,
    value: {
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      interval: data.interval,
      expiresIn: data.expires_in,
    },
  };
}

export async function pollDeviceFlow(
  clientId: string,
  deviceCode: string,
  interval: number,
  fetchImpl: typeof fetch = fetch,
): Promise<FlowResult<PollOutcome>> {
  const sent = await postForm(
    "https://github.com/login/oauth/access_token",
    {
      client_id: clientId,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    },
    fetchImpl,
  );
  if (!sent.ok) return sent;
  const parsed = tokenSchema.safeParse(sent.body);
  if (!parsed.success) return { ok: false, reason: "Unexpected response from GitHub" };
  if ("access_token" in parsed.data) {
    return { ok: true, value: { status: "connected", accessToken: parsed.data.access_token } };
  }
  switch (parsed.data.error) {
    case "authorization_pending":
      return { ok: true, value: { status: "pending", interval } };
    case "slow_down":
      return { ok: true, value: { status: "pending", interval: interval + 5 } };
    case "expired_token":
      return { ok: false, reason: "Sign-in expired. Start again." };
    case "access_denied":
      return { ok: false, reason: "Sign-in was cancelled on GitHub." };
    default:
      return { ok: false, reason: "GitHub sign-in failed" };
  }
}
