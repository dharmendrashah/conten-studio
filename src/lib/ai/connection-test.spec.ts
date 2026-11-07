import { listProviderModels, testProviderConnection } from "./connection-test";

const KEY = "sk-live-secret-1234";

function fakeFetch(response: Response | Error) {
  return jest.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  }) as unknown as jest.MockedFunction<typeof fetch>;
}

describe("testProviderConnection", () => {
  it("calls the OpenAI models endpoint with a bearer token", async () => {
    const fetchImpl = fakeFetch(new Response(null, { status: 200 }));
    await testProviderConnection("openai", KEY, fetchImpl);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/models");
    expect(init?.headers).toEqual({ Authorization: `Bearer ${KEY}` });
  });

  it("calls the Anthropic models endpoint with x-api-key and a version header", async () => {
    const fetchImpl = fakeFetch(new Response(null, { status: 200 }));
    await testProviderConnection("anthropic", KEY, fetchImpl);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/models");
    expect(init?.headers).toEqual({ "x-api-key": KEY, "anthropic-version": "2023-06-01" });
  });

  it("calls the Google Gemini models endpoint with the API key header", async () => {
    const fetchImpl = fakeFetch(new Response(null, { status: 200 }));
    await testProviderConnection("google", KEY, fetchImpl);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models");
    expect(init?.headers).toEqual({ "x-goog-api-key": KEY });
  });

  it("reports success on a 200 response", async () => {
    const result = await testProviderConnection("openai", KEY, fakeFetch(new Response(null, { status: 200 })));
    expect(result).toEqual({ ok: true });
  });

  it("reports a rejected key on 401 and 403", async () => {
    const unauthorized = await testProviderConnection("openai", KEY, fakeFetch(new Response(null, { status: 401 })));
    const forbidden = await testProviderConnection("openai", KEY, fakeFetch(new Response(null, { status: 403 })));
    expect(unauthorized).toEqual({ ok: false, reason: "The API key was rejected" });
    expect(forbidden).toEqual({ ok: false, reason: "The API key was rejected" });
  });

  it("reports other HTTP failures with the status code", async () => {
    const result = await testProviderConnection("google", KEY, fakeFetch(new Response(null, { status: 503 })));
    expect(result).toEqual({ ok: false, reason: "Provider responded with status 503" });
  });

  it("reports a network failure", async () => {
    const result = await testProviderConnection("anthropic", KEY, fakeFetch(new Error("getaddrinfo ENOTFOUND")));
    expect(result).toEqual({ ok: false, reason: "Could not reach the provider" });
  });

  it("never includes the API key in a failure reason", async () => {
    const results = await Promise.all([
      testProviderConnection("openai", KEY, fakeFetch(new Response(null, { status: 401 }))),
      testProviderConnection("openai", KEY, fakeFetch(new Error(`boom ${KEY}`))),
    ]);
    for (const result of results) {
      expect(JSON.stringify(result)).not.toContain(KEY);
    }
  });
});

describe("listProviderModels", () => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("returns OpenAI model ids", async () => {
    const result = await listProviderModels("openai", KEY, fakeFetch(json({ data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }] })));
    expect(result).toEqual({ ok: true, models: ["gpt-4o", "gpt-4o-mini"] });
  });

  it("returns Anthropic model ids", async () => {
    const result = await listProviderModels("anthropic", KEY, fakeFetch(json({ data: [{ id: "claude-sonnet-4-5" }] })));
    expect(result).toEqual({ ok: true, models: ["claude-sonnet-4-5"] });
  });

  it("strips the models/ prefix from Google model names", async () => {
    const result = await listProviderModels("google", KEY, fakeFetch(json({ models: [{ name: "models/gemini-2.5-flash" }] })));
    expect(result).toEqual({ ok: true, models: ["gemini-2.5-flash"] });
  });

  it("rejects an unexpected response body", async () => {
    const result = await listProviderModels("openai", KEY, fakeFetch(json({ unexpected: true })));
    expect(result).toEqual({ ok: false, reason: "Unexpected response from provider" });
  });

  it("passes through a rejected key", async () => {
    const result = await listProviderModels("openai", KEY, fakeFetch(new Response(null, { status: 401 })));
    expect(result).toEqual({ ok: false, reason: "The API key was rejected" });
  });

  it("never includes the API key in a failure reason", async () => {
    const result = await listProviderModels("openai", KEY, fakeFetch(new Error(`boom ${KEY}`)));
    expect(JSON.stringify(result)).not.toContain(KEY);
  });
});

describe("OpenRouter", () => {
  it("checks the key against the OpenRouter key endpoint with a bearer token", async () => {
    const fetchImpl = fakeFetch(new Response(null, { status: 200 }));
    await testProviderConnection("openrouter", KEY, fetchImpl);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/key");
    expect(init?.headers).toEqual({ Authorization: `Bearer ${KEY}` });
  });

  it("lists OpenRouter model ids from the models endpoint", async () => {
    const fetchImpl = fakeFetch(
      new Response(JSON.stringify({ data: [{ id: "openai/gpt-4o" }] }), { status: 200 }),
    );
    const result = await listProviderModels("openrouter", KEY, fetchImpl);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/models");
    expect(result).toEqual({ ok: true, models: ["openai/gpt-4o"] });
  });
});

describe("GitHub Copilot", () => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("exchanges the GitHub token for a Copilot token before listing models", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(json({ token: "copilot-abc" }))
      .mockResolvedValueOnce(json({ data: [{ id: "gpt-4o" }] }));
    const result = await listProviderModels("github", KEY, fetchImpl as unknown as typeof fetch);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.github.com/copilot_internal/v2/token");
    expect(fetchImpl.mock.calls[0][1]?.headers).toMatchObject({ Authorization: `token ${KEY}` });
    expect(fetchImpl.mock.calls[1][0]).toBe("https://api.githubcopilot.com/models");
    expect(fetchImpl.mock.calls[1][1]?.headers).toMatchObject({ Authorization: "Bearer copilot-abc" });
    expect(result).toEqual({ ok: true, models: ["gpt-4o"] });
  });

  it("reports Copilot access denied with the HTTP status on 403", async () => {
    const result = await testProviderConnection("github", KEY, fakeFetch(new Response(null, { status: 403 })));
    expect(result).toEqual({
      ok: false,
      reason: "GitHub denied Copilot access (HTTP 403). Check that this account has an active Copilot subscription.",
    });
  });

  it("reports an expired GitHub sign-in on 401", async () => {
    const result = await testProviderConnection("github", KEY, fakeFetch(new Response(null, { status: 401 })));
    expect(result).toEqual({
      ok: false,
      reason: "GitHub sign-in expired or was revoked (HTTP 401). Sign in again.",
    });
  });
});

