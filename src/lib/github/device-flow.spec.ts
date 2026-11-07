import { pollDeviceFlow, startDeviceFlow } from "./device-flow";

const CLIENT_ID = "test-client";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function fakeFetch(response: Response | Error) {
  return jest.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  }) as unknown as jest.MockedFunction<typeof fetch>;
}

describe("startDeviceFlow", () => {
  it("requests a device code with the client id and read:user scope", async () => {
    const fetchImpl = fakeFetch(
      json({ device_code: "dev", user_code: "ABCD-1234", verification_uri: "https://github.com/login/device", interval: 5, expires_in: 900 }),
    );
    await startDeviceFlow(CLIENT_ID, fetchImpl);
    const [url, init] = fetchImpl.mock.calls[0];
    const body = new URLSearchParams(init?.body as string);
    expect(url).toBe("https://github.com/login/device/code");
    expect(body.get("client_id")).toBe(CLIENT_ID);
    expect(body.get("scope")).toBe("read:user");
  });

  it("returns the codes the user needs and the device code to poll with", async () => {
    const result = await startDeviceFlow(
      CLIENT_ID,
      fakeFetch(json({ device_code: "dev", user_code: "ABCD-1234", verification_uri: "https://github.com/login/device", interval: 5, expires_in: 900 })),
    );
    expect(result).toEqual({
      ok: true,
      value: { deviceCode: "dev", userCode: "ABCD-1234", verificationUri: "https://github.com/login/device", interval: 5, expiresIn: 900 },
    });
  });

  it("rejects an unexpected response", async () => {
    const result = await startDeviceFlow(CLIENT_ID, fakeFetch(json({ nope: true })));
    expect(result).toEqual({ ok: false, reason: "Unexpected response from GitHub" });
  });
});

describe("pollDeviceFlow", () => {
  it("exchanges the device code using the device_code grant", async () => {
    const fetchImpl = fakeFetch(json({ access_token: "gho_token" }));
    await pollDeviceFlow(CLIENT_ID, "dev", 5, fetchImpl);
    const [url, init] = fetchImpl.mock.calls[0];
    const body = new URLSearchParams(init?.body as string);
    expect(url).toBe("https://github.com/login/oauth/access_token");
    expect(body.get("device_code")).toBe("dev");
    expect(body.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:device_code");
  });

  it("stays pending while the user has not approved yet", async () => {
    const result = await pollDeviceFlow(CLIENT_ID, "dev", 5, fakeFetch(json({ error: "authorization_pending" })));
    expect(result).toEqual({ ok: true, value: { status: "pending", interval: 5 } });
  });

  it("backs off by five seconds on slow_down", async () => {
    const result = await pollDeviceFlow(CLIENT_ID, "dev", 5, fakeFetch(json({ error: "slow_down" })));
    expect(result).toEqual({ ok: true, value: { status: "pending", interval: 10 } });
  });

  it("returns the access token once approved", async () => {
    const result = await pollDeviceFlow(CLIENT_ID, "dev", 5, fakeFetch(json({ access_token: "gho_token" })));
    expect(result).toEqual({ ok: true, value: { status: "connected", accessToken: "gho_token" } });
  });

  it("fails when the code expires", async () => {
    const result = await pollDeviceFlow(CLIENT_ID, "dev", 5, fakeFetch(json({ error: "expired_token" })));
    expect(result).toEqual({ ok: false, reason: "Sign-in expired. Start again." });
  });

  it("fails when the user cancels on GitHub", async () => {
    const result = await pollDeviceFlow(CLIENT_ID, "dev", 5, fakeFetch(json({ error: "access_denied" })));
    expect(result).toEqual({ ok: false, reason: "Sign-in was cancelled on GitHub." });
  });
});
